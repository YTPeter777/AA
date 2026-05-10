/**
 * Firebase Service Layer
 * 統一管理所有 Firebase 操作
 * 包含：錯誤處理、重試機制、離線快取、樂觀更新
 */

// ═══════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════
const FB_CONFIG = {
    DB_URL: 'https://mvpp-8d9cd-default-rtdb.firebaseio.com',
    STORAGE_URL: 'https://firebasestorage.googleapis.com/v0/b/mvpp-8d9cd.appspot.com/o',
    
    // 重試策略
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
    RETRY_BACKOFF: 2,
    
    // 快取策略
    CACHE_ENABLED: true,
    CACHE_TTL_MS: 5 * 60 * 1000, // 5 分鐘
    
    // 離線隊列
    OFFLINE_QUEUE_ENABLED: true,
};

// ═══════════════════════════════════════
//  STATE
// ═══════════════════════════════════════
class FirebaseCache {
    constructor() {
        this.cache = new Map();
        this.timers = new Map();
    }

    set(key, value, ttlMs = FB_CONFIG.CACHE_TTL_MS) {
        this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        
        // 清舊 timer
        if (this.timers.has(key)) clearTimeout(this.timers.get(key));
        
        // 設新 timer
        this.timers.set(key, setTimeout(() => {
            this.cache.delete(key);
            this.timers.delete(key);
        }, ttlMs));
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }

    clear() {
        this.timers.forEach(t => clearTimeout(t));
        this.cache.clear();
        this.timers.clear();
    }

    invalidate(pattern) {
        const regex = new RegExp(pattern);
        Array.from(this.cache.keys()).forEach(key => {
            if (regex.test(key)) {
                this.cache.delete(key);
                clearTimeout(this.timers.get(key));
                this.timers.delete(key);
            }
        });
    }
}

class OfflineQueue {
    constructor() {
        this.queue = [];
        this.isOnline = navigator.onLine;
        window.addEventListener('online', () => this.onOnline());
        window.addEventListener('offline', () => { this.isOnline = false; });
    }

    add(operation) {
        this.queue.push({ ...operation, queuedAt: Date.now(), id: Math.random() });
        if (this.isOnline) this.flush();
    }

    async onOnline() {
        this.isOnline = true;
        await this.flush();
    }

    async flush() {
        while (this.queue.length > 0 && this.isOnline) {
            const op = this.queue[0];
            try {
                await op.fn();
                this.queue.shift();
                if (op.onSuccess) op.onSuccess();
            } catch (err) {
                if (op.onError) op.onError(err);
                break; // 停止處理直到下一次上線
            }
        }
    }

    getQueueLength() {
        return this.queue.length;
    }

    clear() {
        this.queue = [];
    }
}

// ═══════════════════════════════════════
//  SERVICE
// ═══════════════════════════════════════
class FirebaseService {
    constructor() {
        this.cache = new FirebaseCache();
        this.offlineQueue = new OfflineQueue();
        this.isOnline = navigator.onLine;
        window.addEventListener('online', () => { this.isOnline = true; });
        window.addEventListener('offline', () => { this.isOnline = false; });
    }

    /**
     * 帶重試、快取、錯誤處理的 fetch
     */
    async fetch(url, options = {}, cacheKey = null, cacheTTL = FB_CONFIG.CACHE_TTL_MS) {
        // 1. 檢查快取
        if (FB_CONFIG.CACHE_ENABLED && cacheKey && options.method !== 'PUT' && options.method !== 'POST' && options.method !== 'DELETE') {
            const cached = this.cache.get(cacheKey);
            if (cached !== null) return cached;
        }

        // 2. 執行請求（帶重試）
        let lastError;
        for (let attempt = 0; attempt < FB_CONFIG.MAX_RETRIES; attempt++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers,
                    },
                });

                if (!response.ok) {
                    if (response.status === 401) throw new Error('UNAUTHORIZED');
                    if (response.status === 403) throw new Error('FORBIDDEN');
                    if (response.status >= 500) {
                        // 伺服器錯誤，重試
                        const delay = FB_CONFIG.RETRY_DELAY_MS * Math.pow(FB_CONFIG.RETRY_BACKOFF, attempt);
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                let data;
                const contentType = response.headers.get('content-type');
                if (contentType?.includes('application/json')) {
                    data = await response.json();
                } else {
                    data = await response.text();
                }

                // 3. 快取結果
                if (FB_CONFIG.CACHE_ENABLED && cacheKey && options.method !== 'PUT' && options.method !== 'POST' && options.method !== 'DELETE') {
                    this.cache.set(cacheKey, data, cacheTTL);
                }

                return data;
            } catch (err) {
                lastError = err;
                if (attempt < FB_CONFIG.MAX_RETRIES - 1) {
                    const delay = FB_CONFIG.RETRY_DELAY_MS * Math.pow(FB_CONFIG.RETRY_BACKOFF, attempt);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        throw lastError || new Error('Firebase fetch failed');
    }

    /**
     * 讀取數據
     */
    async read(path, cacheKey = null) {
        const url = `${FB_CONFIG.DB_URL}${path}.json`;
        return this.fetch(url, { method: 'GET' }, cacheKey);
    }

    /**
     * 寫入數據（樂觀更新）
     */
    async write(path, data, options = {}) {
        const url = `${FB_CONFIG.DB_URL}${path}.json`;
        const cacheKey = `path:${path}`;

        // 樂觀更新快取
        this.cache.set(cacheKey, data);

        // 如果離線，加入隊列
        if (!this.isOnline && FB_CONFIG.OFFLINE_QUEUE_ENABLED) {
            return new Promise((resolve, reject) => {
                this.offlineQueue.add({
                    fn: async () => {
                        const result = await this.fetch(url, {
                            method: 'PUT',
                            body: JSON.stringify(data),
                        });
                        // 寫入成功後，清除該路徑相關快取
                        this.cache.invalidate(`.*${path.split('/')[1]}`);
                        resolve(result);
                    },
                    onSuccess: resolve,
                    onError: reject,
                });
            });
        }

        try {
            const result = await this.fetch(url, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
            // 清除相關快取
            this.cache.invalidate(`.*${path.split('/')[1]}`);
            return result;
        } catch (err) {
            // 恢復樂觀更新
            this.cache.invalidate(`.*${path}`);
            throw err;
        }
    }

    /**
     * 追加數據（POST）
     */
    async append(path, data, options = {}) {
        const url = `${FB_CONFIG.DB_URL}${path}.json`;
        const cacheKey = `path:${path}`;

        if (!this.isOnline && FB_CONFIG.OFFLINE_QUEUE_ENABLED) {
            return new Promise((resolve, reject) => {
                this.offlineQueue.add({
                    fn: async () => {
                        const result = await this.fetch(url, {
                            method: 'POST',
                            body: JSON.stringify(data),
                        });
                        this.cache.invalidate(`.*${path.split('/')[1]}`);
                        resolve(result);
                    },
                    onSuccess: resolve,
                    onError: reject,
                });
            });
        }

        try {
            const result = await this.fetch(url, {
                method: 'POST',
                body: JSON.stringify(data),
            });
            this.cache.invalidate(`.*${path.split('/')[1]}`);
            return result;
        } catch (err) {
            throw err;
        }
    }

    /**
     * 刪除數據
     */
    async delete(path) {
        const url = `${FB_CONFIG.DB_URL}${path}.json`;
        try {
            const result = await this.fetch(url, { method: 'DELETE' });
            this.cache.invalidate(`.*${path.split('/')[1]}`);
            return result;
        } catch (err) {
            throw err;
        }
    }

    /**
     * 上傳檔案至 Firebase Storage
     */
    async uploadFile(filePath, file, onProgress) {
        const encodedPath = encodeURIComponent(filePath);
        const uploadUrl = `${FB_CONFIG.STORAGE_URL}?uploadType=media&name=${encodedPath}`;

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            if (onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        onProgress(Math.round((e.loaded / e.total) * 100));
                    }
                });
            }

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const publicUrl = `${FB_CONFIG.STORAGE_URL}/${encodedPath}?alt=media`;
                    resolve({ path: filePath, url: publicUrl });
                } else {
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Upload error')));

            xhr.open('POST', uploadUrl);
            xhr.setRequestHeader('Content-Type', file.type);
            xhr.send(file);
        });
    }

    /**
     * 從 Firebase Storage 刪除檔案
     */
    async deleteFile(filePath) {
        const encodedPath = encodeURIComponent(filePath);
        try {
            await this.fetch(`${FB_CONFIG.STORAGE_URL}/${encodedPath}`, {
                method: 'DELETE',
            });
        } catch (err) {
            console.error('Delete file error:', err);
            // Storage 刪除可能失敗，但不中斷流程
        }
    }

    /**
     * 測試連線 (ping)
     */
    async ping() {
        const start = Date.now();
        try {
            // 讀
            await this.fetch(`${FB_CONFIG.DB_URL}/system/ping.json?sv=${Date.now()}`, {
                method: 'GET',
            }, null, 0); // 不快取 ping
            const readLatency = Date.now() - start;

            // 寫
            const writeStart = Date.now();
            await this.fetch(`${FB_CONFIG.DB_URL}/system/ping.json`, {
                method: 'PUT',
                body: JSON.stringify({ ts: new Date().toISOString() }),
            });
            const writeLatency = Date.now() - writeStart;

            return {
                ok: true,
                readLatency,
                writeLatency,
                avgLatency: Math.round((readLatency + writeLatency) / 2),
            };
        } catch (err) {
            return {
                ok: false,
                error: err.message,
            };
        }
    }

    /**
     * 取得離線隊列狀態
     */
    getOfflineQueueStatus() {
        return {
            isOnline: this.isOnline,
            queueLength: this.offlineQueue.getQueueLength(),
            isFlushing: this.offlineQueue.isFlushing,
        };
    }

    /**
     * 清空快取
     */
    clearCache() {
        this.cache.clear();
    }
}

// ═══════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════
const fbService = new FirebaseService();

// 全域暴露（給 HTML inline script 使用）
window.fbService = fbService;
