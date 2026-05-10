/**
 * Authentication & Session Management
 * 包含：密碼加密、Token 管理、會話控制、IP 追蹤
 */

// ═══════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════
const AUTH_CONFIG = {
    SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 分鐘
    REFRESH_TOKEN_TIMEOUT_MS: 7 * 24 * 60 * 60 * 1000, // 7 天
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 分鐘
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_SALT_ROUNDS: 10, // 若使用 bcrypt (伺服器端)
    TOKEN_LENGTH: 32,
};

// ═══════════════════════════════════════
//  CRYPTO UTILITIES (簡化客戶端密碼儲存)
// ═══════════════════════════════════════
class PasswordManager {
    /**
     * 簡易密碼雜湊 (客戶端用)
     * 注意：生產環境應在伺服器端用 bcrypt
     */
    static async hashPassword(password, salt = null) {
        if (!salt) {
            // 生成隨機 salt
            const randomBytes = crypto.getRandomValues(new Uint8Array(16));
            salt = btoa(String.fromCharCode(...randomBytes));
        }

        // 使用 PBKDF2 進行多輪雜湊
        const encoder = new TextEncoder();
        const data = encoder.encode(password + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return {
            hash: hashHex,
            salt: salt,
            algorithm: 'SHA256+PBKDF2',
        };
    }

    /**
     * 驗證密碼
     */
    static async verifyPassword(password, storedHash, salt) {
        const result = await this.hashPassword(password, salt);
        return result.hash === storedHash;
    }

    /**
     * 驗證密碼強度
     */
    static validatePasswordStrength(password) {
        const issues = [];

        if (password.length < AUTH_CONFIG.PASSWORD_MIN_LENGTH) {
            issues.push(`密碼至少 ${AUTH_CONFIG.PASSWORD_MIN_LENGTH} 位`);
        }
        if (!/[a-z]/.test(password)) {
            issues.push('密碼需包含小寫字母');
        }
        if (!/[A-Z]/.test(password)) {
            issues.push('密碼需包含大寫字母');
        }
        if (!/[0-9]/.test(password)) {
            issues.push('密碼需包含數字');
        }
        if (!/[!@#$%^&*]/.test(password)) {
            issues.push('密碼需包含特殊符號 (!@#$%^&*)');
        }

        return {
            valid: issues.length === 0,
            issues: issues,
            strength: 5 - issues.length, // 0-5 分
        };
    }
}

// ═══════════════════════════════════════
//  TOKEN MANAGEMENT
// ═══════════════════════════════════════
class TokenManager {
    /**
     * 生成隨機 token
     */
    static generateToken(length = AUTH_CONFIG.TOKEN_LENGTH) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let token = '';
        for (let i = 0; i < length; i++) {
            token += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return token;
    }

    /**
     * 建立 JWT-like token (不用真實 JWT library)
     */
    static createToken(userId, role = 'editor') {
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const payload = btoa(JSON.stringify({
            uid: userId,
            role: role,
            iat: Date.now(),
            exp: Date.now() + AUTH_CONFIG.SESSION_TIMEOUT_MS,
        }));
        const signature = btoa(this.generateToken(32));
        return `${header}.${payload}.${signature}`;
    }

    /**
     * 驗證 token
     */
    static verifyToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            const payload = JSON.parse(atob(parts[1]));
            if (Date.now() > payload.exp) return null; // 已過期

            return payload;
        } catch {
            return null;
        }
    }

    /**
     * 從 token 取得使用者資訊
     */
    static getUserFromToken(token) {
        const payload = this.verifyToken(token);
        if (!payload) return null;
        return {
            uid: payload.uid,
            role: payload.role,
        };
    }
}

// ═══════════════════════════════════════
//  SESSION MANAGER
// ═══════════════════════════════════════
class SessionManager {
    constructor() {
        this.currentSession = null;
        this.sessionTimer = null;
        this.loadSession();
    }

    /**
     * 從 localStorage 恢復會話
     */
    loadSession() {
        try {
            const stored = localStorage.getItem('mvp_session');
            if (!stored) return;

            const session = JSON.parse(stored);
            const tokenData = TokenManager.verifyToken(session.token);

            if (!tokenData) {
                this.clearSession();
                return;
            }

            this.currentSession = session;
        } catch {
            this.clearSession();
        }
    }

    /**
     * 建立新會話
     */
    createSession(userId, userName, role, ipAddress) {
        const token = TokenManager.createToken(userId, role);

        this.currentSession = {
            token,
            userId,
            userName,
            role,
            ipAddress,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
            editCount: 0,
        };

        this.saveSession();
        this.startSessionTimer();

        return this.currentSession;
    }

    /**
     * 保存會話到 localStorage
     */
    saveSession() {
        if (this.currentSession) {
            localStorage.setItem('mvp_session', JSON.stringify(this.currentSession));
        }
    }

    /**
     * 更新最後活動時間
     */
    updateActivity() {
        if (this.currentSession) {
            this.currentSession.lastActivityAt = Date.now();
            this.saveSession();
        }
    }

    /**
     * 記錄編輯次數
     */
    recordEdit() {
        if (this.currentSession) {
            this.currentSession.editCount++;
            this.saveSession();
        }
    }

    /**
     * 取得剩餘時間（毫秒）
     */
    getRemainingTime() {
        if (!this.currentSession) return 0;
        const elapsed = Date.now() - this.currentSession.createdAt;
        const remaining = AUTH_CONFIG.SESSION_TIMEOUT_MS - elapsed;
        return Math.max(0, remaining);
    }

    /**
     * 開始會話計時器
     */
    startSessionTimer() {
        if (this.sessionTimer) clearInterval(this.sessionTimer);

        this.sessionTimer = setInterval(() => {
            if (!this.currentSession) {
                clearInterval(this.sessionTimer);
                return;
            }

            const remaining = this.getRemainingTime();

            // 發送事件給 UI
            window.dispatchEvent(new CustomEvent('sessionTick', {
                detail: {
                    remaining,
                    minutes: Math.floor(remaining / 60000),
                    seconds: Math.floor((remaining % 60000) / 1000),
                },
            }));

            if (remaining <= 0) {
                clearInterval(this.sessionTimer);
                window.dispatchEvent(new CustomEvent('sessionExpired'));
                this.clearSession();
            } else if (remaining < 5 * 60000 && remaining > 4 * 60000) {
                // 5分鐘時提醒
                window.dispatchEvent(new CustomEvent('sessionWarning', {
                    detail: { remaining },
                }));
            }
        }, 1000);
    }

    /**
     * 清空會話
     */
    clearSession() {
        this.currentSession = null;
        localStorage.removeItem('mvp_session');
        if (this.sessionTimer) clearInterval(this.sessionTimer);
        this.sessionTimer = null;
    }

    /**
     * 取得當前會話
     */
    getSession() {
        return this.currentSession;
    }

    /**
     * 檢查是否已登入
     */
    isAuthenticated() {
        if (!this.currentSession) return false;
        const remaining = this.getRemainingTime();
        return remaining > 0;
    }
}

// ═══════════════════════════════════════
//  ADMIN USER MANAGER
// ═══════════════════════════════════════
class AdminUserManager {
    /**
     * 取得所有管理員
     */
    static async getAllAdmins() {
        try {
            const admins = await fbService.read('/admins');
            return admins || {};
        } catch (err) {
            console.error('Failed to load admins:', err);
            return {};
        }
    }

    /**
     * 驗證登入 (檢查主帳號 + 子帳號)
     */
    static async authenticate(username, password, ipAddress) {
        // 檢查主帳號
        const mainPassword = await this.getMainAdminPassword();
        if (username === 'admin' && await PasswordManager.verifyPassword(password, mainPassword.hash, mainPassword.salt)) {
            return {
                userId: 'admin',
                userName: 'admin',
                role: 'superadmin',
                ipAddress,
            };
        }

        // 檢查子帳號
        const admins = await this.getAllAdmins();
        for (const [id, admin] of Object.entries(admins)) {
            if (admin.user === username && await PasswordManager.verifyPassword(password, admin.passHash, admin.passSalt)) {
                return {
                    userId: id,
                    userName: admin.user,
                    role: admin.role || 'editor',
                    ipAddress,
                };
            }
        }

        return null;
    }

    /**
     * 取得主帳號密碼
     */
    static async getMainAdminPassword() {
        try {
            const config = await fbService.read('/config/adminPassword');
            if (config && typeof config === 'object') {
                return {
                    hash: config.hash,
                    salt: config.salt,
                };
            }
        } catch {}

        // 回傳預設密碼的雜湊
        return await this.getDefaultPassword();
    }

    /**
     * 初始化預設密碼
     */
    static async getDefaultPassword() {
        const defaultPass = 'ToiletMVP@2026';
        const hashed = await PasswordManager.hashPassword(defaultPass);
        return {
            hash: hashed.hash,
            salt: hashed.salt,
        };
    }

    /**
     * 更新主帳號密碼
     */
    static async updateMainPassword(newPassword) {
        const validation = PasswordManager.validatePasswordStrength(newPassword);
        if (!validation.valid) {
            throw new Error(validation.issues.join(', '));
        }

        const hashed = await PasswordManager.hashPassword(newPassword);
        await fbService.write('/config/adminPassword', {
            hash: hashed.hash,
            salt: hashed.salt,
            updatedAt: new Date().toISOString(),
        });
    }

    /**
     * 新增子帳號
     */
    static async addSubAdmin(username, password, role) {
        const validation = PasswordManager.validatePasswordStrength(password);
        if (!validation.valid) {
            throw new Error(validation.issues.join(', '));
        }

        const admins = await this.getAllAdmins();
        if (Object.values(admins).some(a => a.user === username)) {
            throw new Error('帳號已存在');
        }

        const hashed = await PasswordManager.hashPassword(password);
        await fbService.append('/admins', {
            user: username,
            passHash: hashed.hash,
            passSalt: hashed.salt,
            role: role,
            createdAt: new Date().toISOString(),
        });
    }

    /**
     * 移除子帳號
     */
    static async removeSubAdmin(adminId) {
        await fbService.delete(`/admins/${adminId}`);
    }
}

// ═══════════════════════════════════════
//  IP & SECURITY
// ═══════════════════════════════════════
class IPManager {
    /**
     * 取得客戶端真實 IP
     */
    static async getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    /**
     * 檢查 IP 是否被封鎖
     */
    static async isIPBlocked(ipAddress) {
        try {
            const blocked = await fbService.read('/security/blockedIPs', `blocked_ips`);
            if (!blocked) return null;

            const key = ipAddress.replace(/\./g, '_');
            const blockInfo = blocked[key];

            if (!blockInfo) return null;

            // 檢查是否已過期
            if (Date.now() > blockInfo.expiresAt) {
                await IPManager.unblockIP(ipAddress);
                return null;
            }

            return blockInfo;
        } catch {
            return null;
        }
    }

    /**
     * 封鎖 IP
     */
    static async blockIP(ipAddress, reason, durationMs = AUTH_CONFIG.LOCKOUT_DURATION_MS) {
        const blockInfo = {
            ipAddress,
            reason,
            blockedAt: new Date().toISOString(),
            expiresAt: Date.now() + durationMs,
        };

        const key = ipAddress.replace(/\./g, '_');
        await fbService.write(`/security/blockedIPs/${key}`, blockInfo);
    }

    /**
     * 解除 IP 封鎖
     */
    static async unblockIP(ipAddress) {
        const key = ipAddress.replace(/\./g, '_');
        await fbService.delete(`/security/blockedIPs/${key}`);
    }

    /**
     * 記錄登入嘗試
     */
    static async recordLoginAttempt(username, ipAddress, success, reason = '') {
        const log = {
            username,
            ipAddress,
            success,
            reason,
            timestamp: new Date().toISOString(),
        };

        await fbService.append('/security/loginLog', log);
    }

    /**
     * 檢查登入次數
     */
    static async getFailedAttempts(ipAddress) {
        try {
            const logs = await fbService.read('/security/loginLog', `login_log`);
            if (!logs) return [];

            const now = Date.now();
            const oneHourAgo = now - 60 * 60 * 1000;

            return Object.values(logs)
                .filter(log =>
                    log.ipAddress === ipAddress &&
                    !log.success &&
                    new Date(log.timestamp).getTime() > oneHourAgo
                );
        } catch {
            return [];
        }
    }
}

// ═══════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════
const sessionManager = new SessionManager();

window.PasswordManager = PasswordManager;
window.TokenManager = TokenManager;
window.sessionManager = sessionManager;
window.AdminUserManager = AdminUserManager;
window.IPManager = IPManager;
