/**
 * Push Notification System
 * 包含：排程管理、FCM 集成、真實發送、追蹤記錄
 */

// ═══════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════
const NOTIFICATION_CONFIG = {
    // Firebase Cloud Messaging
    FCM_API_KEY: 'YOUR_FCM_API_KEY', // 需要在 Firebase Console 設置
    FCM_ENDPOINT: 'https://fcm.googleapis.com/fcm/send',

    // 排程設定
    MIN_SCHEDULE_DELAY_MS: 60 * 1000, // 最少 1 分鐘後
    MAX_BATCH_SIZE: 500, // 單次最多推送 500 個用戶
    BATCH_DELAY_MS: 100, // 批次間隔

    // 重試設定
    MAX_SEND_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
};

// ═══════════════════════════════════════
//  NOTIFICATION MANAGER
// ═══════════════════════════════════════
class NotificationScheduler {
    constructor() {
        this.scheduledJobs = new Map();
        this.loadScheduledNotifications();
    }

    /**
     * 從 Firebase 載入所有排程通知
     */
    async loadScheduledNotifications() {
        try {
            const jobs = await fbService.read('/scheduled_notifications', 'scheduled_notifications');
            if (!jobs) return;

            Object.entries(jobs).forEach(([id, job]) => {
                if (job.status === 'pending' && new Date(job.sendAt) > new Date()) {
                    this.scheduleJob(id, job);
                }
            });
        } catch (err) {
            console.error('Failed to load scheduled notifications:', err);
        }
    }

    /**
     * 建立排程工作
     */
    scheduleJob(jobId, jobData) {
        const now = Date.now();
        const sendTime = new Date(jobData.sendAt).getTime();
        const delayMs = sendTime - now;

        if (delayMs < 0) return; // 已過期

        const timeoutId = setTimeout(async () => {
            try {
                await this.executeJob(jobId, jobData);
            } catch (err) {
                console.error(`Job ${jobId} failed:`, err);
                await this.updateJobStatus(jobId, 'failed', err.message);
            }
            this.scheduledJobs.delete(jobId);
        }, delayMs);

        this.scheduledJobs.set(jobId, {
            jobId,
            jobData,
            timeoutId,
            scheduledAt: new Date().toISOString(),
            status: 'scheduled',
        });
    }

    /**
     * 執行排程工作
     */
    async executeJob(jobId, jobData) {
        try {
            // 1. 根據目標條件取得 FCM tokens
            const tokens = await this.getTargetTokens(jobData.target);
            if (tokens.length === 0) {
                await this.updateJobStatus(jobId, 'completed', '無有效接收者');
                return;
            }

            // 2. 分批發送
            const batches = [];
            for (let i = 0; i < tokens.length; i += NOTIFICATION_CONFIG.MAX_BATCH_SIZE) {
                batches.push(tokens.slice(i, i + NOTIFICATION_CONFIG.MAX_BATCH_SIZE));
            }

            let successCount = 0;
            let failureCount = 0;

            for (const [index, batch] of batches.entries()) {
                try {
                    const result = await this.sendBatch(jobData, batch);
                    successCount += result.success;
                    failureCount += result.failure;

                    // 批次之間延遲
                    if (index < batches.length - 1) {
                        await new Promise(r => setTimeout(r, NOTIFICATION_CONFIG.BATCH_DELAY_MS));
                    }
                } catch (err) {
                    console.error(`Batch ${index} failed:`, err);
                    failureCount += batch.length;
                }
            }

            // 3. 記錄結果
            await this.recordNotificationResult(jobId, {
                sentAt: new Date().toISOString(),
                totalTargets: tokens.length,
                successCount,
                failureCount,
                batchCount: batches.length,
            });

            // 4. 更新工作狀態
            await this.updateJobStatus(jobId, 'sent', `成功: ${successCount}, 失敗: ${failureCount}`);
        } catch (err) {
            throw err;
        }
    }

    /**
     * 根據目標條件取得 FCM tokens
     */
    async getTargetTokens(target) {
        try {
            const visits = await fbService.read('/visits', 'visits');
            if (!visits || !visits.tokens) return [];

            const allTokens = visits.tokens;
            const today = new Date().toISOString().split('T')[0];

            switch (target) {
                case 'all':
                    return Object.keys(allTokens);

                case 'today':
                    return Object.keys(allTokens).filter(token => {
                        const tokenData = allTokens[token];
                        return tokenData.lastVisit && tokenData.lastVisit.startsWith(today);
                    });

                case 'returning':
                    return Object.keys(allTokens).filter(token => {
                        const tokenData = allTokens[token];
                        return (tokenData.visitCount || 0) >= 2;
                    });

                default:
                    return [];
            }
        } catch (err) {
            console.error('Failed to get target tokens:', err);
            return [];
        }
    }

    /**
     * 分批發送通知
     */
    async sendBatch(jobData, tokens) {
        const payload = {
            title: jobData.title,
            body: jobData.body,
            data: {
                timestamp: new Date().toISOString(),
                jobId: jobData.jobId || '',
            },
        };

        let successCount = 0;
        let failureCount = 0;

        for (const token of tokens) {
            try {
                await this.sendToToken(token, payload);
                successCount++;
            } catch (err) {
                console.error(`Failed to send to token ${token}:`, err);
                failureCount++;
            }
        }

        return { success: successCount, failure: failureCount };
    }

    /**
     * 發送給單個 token
     */
    async sendToToken(token, payload, retries = 0) {
        try {
            const response = await fetch(NOTIFICATION_CONFIG.FCM_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `key=${NOTIFICATION_CONFIG.FCM_API_KEY}`,
                },
                body: JSON.stringify({
                    to: token,
                    notification: payload,
                    time_to_live: 86400, // 24 小時
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                if (response.status === 401) {
                    throw new Error('FCM_UNAUTHORIZED');
                }
                throw new Error(`FCM error: ${data.error}`);
            }

            return await response.json();
        } catch (err) {
            if (retries < NOTIFICATION_CONFIG.MAX_SEND_RETRIES) {
                await new Promise(r => setTimeout(r, NOTIFICATION_CONFIG.RETRY_DELAY_MS));
                return this.sendToToken(token, payload, retries + 1);
            }
            throw err;
        }
    }

    /**
     * 更新工作狀態
     */
    async updateJobStatus(jobId, status, detail = '') {
        try {
            await fbService.write(`/scheduled_notifications/${jobId}`, {
                status,
                detail,
                updatedAt: new Date().toISOString(),
            });

            // 無效化快取
            fbService.cache.invalidate('.*scheduled_notifications');
        } catch (err) {
            console.error('Failed to update job status:', err);
        }
    }

    /**
     * 記錄通知結果
     */
    async recordNotificationResult(jobId, result) {
        try {
            await fbService.append('/notification_results', {
                jobId,
                ...result,
            });
        } catch (err) {
            console.error('Failed to record result:', err);
        }
    }

    /**
     * 取消排程工作
     */
    async cancelJob(jobId) {
        const job = this.scheduledJobs.get(jobId);
        if (job) {
            clearTimeout(job.timeoutId);
            this.scheduledJobs.delete(jobId);
        }

        await fbService.delete(`/scheduled_notifications/${jobId}`);
    }

    /**
     * 建立新排程通知
     */
    async createScheduledNotification(title, body, target, sendAt, createdBy) {
        const sendTime = new Date(sendAt).getTime();
        const now = Date.now();

        if (sendTime - now < NOTIFICATION_CONFIG.MIN_SCHEDULE_DELAY_MS) {
            throw new Error(`排程時間必須至少 1 分鐘後`);
        }

        const notification = {
            title,
            body,
            target,
            sendAt: new Date(sendAt).toISOString(),
            createdAt: new Date().toISOString(),
            createdBy,
            status: 'pending',
        };

        try {
            const result = await fbService.append('/scheduled_notifications', notification);
            const jobId = result.name; // Firebase 返回的 key
            this.scheduleJob(jobId, notification);
            return jobId;
        } catch (err) {
            throw new Error(`Failed to schedule notification: ${err.message}`);
        }
    }

    /**
     * 取得排程清單
     */
    async getScheduledList() {
        try {
            const jobs = await fbService.read('/scheduled_notifications', 'scheduled_notifications');
            if (!jobs) return [];

            return Object.entries(jobs)
                .map(([id, job]) => ({ id, ...job }))
                .filter(job => job.status === 'pending')
                .sort((a, b) => new Date(a.sendAt) - new Date(b.sendAt));
        } catch (err) {
            console.error('Failed to get scheduled list:', err);
            return [];
        }
    }

    /**
     * 取得發送記錄
     */
    async getNotificationHistory(limit = 50) {
        try {
            const results = await fbService.read('/notification_results', 'notification_results');
            if (!results) return [];

            return Object.entries(results)
                .map(([id, result]) => ({ id, ...result }))
                .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
                .slice(0, limit);
        } catch (err) {
            console.error('Failed to get notification history:', err);
            return [];
        }
    }

    /**
     * 取得工作狀態
     */
    getJobStatus(jobId) {
        return this.scheduledJobs.get(jobId) || null;
    }

    /**
     * 取得所有工作狀態
     */
    getAllJobStatuses() {
        return Array.from(this.scheduledJobs.values());
    }
}

// ═══════════════════════════════════════
//  SERVICE WORKER - 接收推播 (前端)
// ═══════════════════════════════════════
class NotificationReceiver {
    /**
     * 初始化服務工作者
     */
    static async initialize() {
        if ('serviceWorker' in navigator && 'Notification' in window) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js', {
                    scope: '/',
                });
                console.log('Service Worker registered:', registration);
            } catch (err) {
                console.error('Service Worker registration failed:', err);
            }
        }
    }

    /**
     * 要求推播權限
     */
    static async requestPermission() {
        if (!('Notification' in window)) {
            return 'denied';
        }

        if (Notification.permission === 'granted') {
            return 'granted';
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission;
        }

        return 'denied';
    }

    /**
     * 記錄 FCM token
     */
    static async registerToken(token) {
        try {
            const tokenData = {
                token,
                registeredAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                userAgent: navigator.userAgent,
                platform: navigator.platform,
            };

            const tokenKey = token.substring(0, 8); // 簡化 key
            await fbService.write(`/visits/tokens/${tokenKey}`, tokenData);
        } catch (err) {
            console.error('Failed to register FCM token:', err);
        }
    }
}

// ═══════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════
const notificationScheduler = new NotificationScheduler();

window.NotificationScheduler = NotificationScheduler;
window.NotificationReceiver = NotificationReceiver;
window.notificationScheduler = notificationScheduler;
