/**
 * Core Business Logic
 * 包含：公告、文案、主題、圖片、編輯歷史、稽核日誌
 */

// ═══════════════════════════════════════
//  DEFAULTS
// ═══════════════════════════════════════
const DEFAULTS = {
    announcement: {
        title: '系統公告',
        body: '同步最新救援狀態，找廁所MVP持續為您服務中。',
    },
    content: {
        heroTitle: '生理需求\n不該是場冒險',
        tech1Title: '一鍵手機導航',
        tech1Desc: '自動串接您的手機導航系統，無需手動輸入，即刻規劃前往目的地的最佳步行路徑。',
        tech2Title: '在地真人評價',
        tech2Desc: '整合數萬名使用者的真實回饋，提供環境與安全度評分，確保您避開地雷、直達最優質空間。',
        scene1Title: '外送夥伴專屬',
        scene1Desc: '針對外送員移動特性，標註路徑順向的點位，讓您在趕單途中迅速完成需求，大幅縮短繞路成本。',
        scene2Title: '旅人即刻救援',
        scene2Desc: '自動鎖定您半徑內最近的優質廁所，讓您在陌生環境中擺脫迷路焦慮，享受安心的旅程。',
    },
    theme: {
        primaryColor: '#38bdf8',
        secondaryColor: '#0284c7',
        accentColor: '#22c55e',
        warnColor: '#f59e0b',
        gradientAngle: '135',
        gradientStart: '#020617',
        gradientEnd: '#1e3a8a',
        titleSize: '1',
        bodySize: '1',
    },
};

// ═══════════════════════════════════════
//  ANNOUNCEMENT MANAGER
// ═══════════════════════════════════════
class AnnouncementManager {
    /**
     * 取得公告
     */
    static async getAnnouncement() {
        try {
            const announcement = await fbService.read('/announcement', 'announcement');
            return announcement || DEFAULTS.announcement;
        } catch (err) {
            console.error('Failed to load announcement:', err);
            return DEFAULTS.announcement;
        }
    }

    /**
     * 儲存公告
     */
    static async saveAnnouncement(title, body) {
        if (!title) throw new Error('公告標題不能為空');

        const data = {
            title,
            body,
            updatedAt: new Date().toISOString(),
            updatedBy: sessionManager.getSession()?.userName || 'unknown',
        };

        await fbService.write('/announcement', data);
        await this.recordHistory('公告更新', title);
    }

    /**
     * 清除公告
     */
    static async clearAnnouncement() {
        await fbService.delete('/announcement');
        await this.recordHistory('公告清除', '');
    }

    /**
     * 還原預設公告
     */
    static async resetAnnouncement() {
        await this.saveAnnouncement(DEFAULTS.announcement.title, DEFAULTS.announcement.body);
    }

    /**
     * 記錄到編輯歷史
     */
    static async recordHistory(type, detail) {
        const session = sessionManager.getSession();
        await fbService.append('/editHistory', {
            type: '公告',
            action: type,
            detail,
            user: session?.userName || 'unknown',
            ipAddress: session?.ipAddress || 'unknown',
            timestamp: new Date().toISOString(),
        });
    }
}

// ═══════════════════════════════════════
//  CONTENT MANAGER
// ═══════════════════════════════════════
class ContentManager {
    /**
     * 取得所有文案
     */
    static async getAllContent() {
        try {
            const content = await fbService.read('/content', 'content');
            return { ...DEFAULTS.content, ...content };
        } catch (err) {
            console.error('Failed to load content:', err);
            return DEFAULTS.content;
        }
    }

    /**
     * 儲存文案
     */
    static async saveContent(contentData) {
        // 驗證必需欄位
        if (!contentData.heroTitle) throw new Error('主標題不能為空');

        const data = {
            ...contentData,
            updatedAt: new Date().toISOString(),
            updatedBy: sessionManager.getSession()?.userName || 'unknown',
        };

        await fbService.write('/content', data);
        await this.recordHistory('文案編輯', '首頁及各區塊');
    }

    /**
     * 還原預設文案
     */
    static async resetContent() {
        await this.saveContent(DEFAULTS.content);
    }

    /**
     * 記錄到編輯歷史
     */
    static async recordHistory(type, detail) {
        const session = sessionManager.getSession();
        await fbService.append('/editHistory', {
            type: '文案',
            action: type,
            detail,
            user: session?.userName || 'unknown',
            ipAddress: session?.ipAddress || 'unknown',
            timestamp: new Date().toISOString(),
        });
    }
}

// ═══════════════════════════════════════
//  THEME MANAGER
// ═══════════════════════════════════════
class ThemeManager {
    /**
     * 取得主題
     */
    static async getTheme() {
        try {
            const theme = await fbService.read('/theme', 'theme');
            return { ...DEFAULTS.theme, ...theme };
        } catch (err) {
            console.error('Failed to load theme:', err);
            return DEFAULTS.theme;
        }
    }

    /**
     * 儲存主題
     */
    static async saveTheme(themeData) {
        const data = {
            ...themeData,
            updatedAt: new Date().toISOString(),
            updatedBy: sessionManager.getSession()?.userName || 'unknown',
        };

        await fbService.write('/theme', data);
        await this.recordHistory('主題設定', '色彩/漸層/字體');
    }

    /**
     * 還原預設主題
     */
    static async resetTheme() {
        await this.saveTheme(DEFAULTS.theme);
    }

    /**
     * 匯出主題 JSON
     */
    static async exportTheme() {
        const theme = await this.getTheme();
        return JSON.stringify(theme, null, 2);
    }

    /**
     * 記錄到編輯歷史
     */
    static async recordHistory(type, detail) {
        const session = sessionManager.getSession();
        await fbService.append('/editHistory', {
            type: '主題',
            action: type,
            detail,
            user: session?.userName || 'unknown',
            ipAddress: session?.ipAddress || 'unknown',
            timestamp: new Date().toISOString(),
        });
    }
}

// ═══════════════════════════════════════
//  IMAGE MANAGER
// ═══════════════════════════════════════
class ImageManager {
    /**
     * 上傳圖片至 Firebase Storage
     */
    static async uploadImage(file, onProgress) {
        // 驗證檔案
        if (!file) throw new Error('檔案不存在');
        if (file.size > 5 * 1024 * 1024) throw new Error('檔案超過 5MB');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            throw new Error('只支援 JPG、PNG、WebP 格式');
        }

        // 建立儲存路徑
        const timestamp = Date.now();
        const filename = `${timestamp}_${file.name}`;
        const filePath = `images/${filename}`;

        try {
            // 上傳至 Firebase Storage
            const uploadResult = await fbService.uploadFile(filePath, file, onProgress);

            // 記錄到資料庫
            const imageData = {
                name: file.name,
                path: filePath,
                url: uploadResult.url,
                size: file.size,
                type: file.type,
                uploadedAt: new Date().toISOString(),
                uploadedBy: sessionManager.getSession()?.userName || 'unknown',
            };

            const result = await fbService.append('/images', imageData);

            // 記錄到編輯歷史
            await this.recordHistory('上傳圖片', file.name);

            return {
                id: result.name,
                ...imageData,
            };
        } catch (err) {
            console.error('Image upload failed:', err);
            throw new Error(`上傳失敗: ${err.message}`);
        }
    }

    /**
     * 取得所有圖片
     */
    static async getAllImages() {
        try {
            const images = await fbService.read('/images', 'images');
            if (!images) return [];

            return Object.entries(images)
                .map(([id, img]) => ({ id, ...img }))
                .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        } catch (err) {
            console.error('Failed to load images:', err);
            return [];
        }
    }

    /**
     * 刪除圖片
     */
    static async deleteImage(imageId, filePath) {
        try {
            // 從 Storage 刪除
            await fbService.deleteFile(filePath);

            // 從資料庫刪除
            await fbService.delete(`/images/${imageId}`);

            // 記錄到編輯歷史
            await this.recordHistory('刪除圖片', filePath);
        } catch (err) {
            console.error('Image deletion failed:', err);
            throw new Error(`刪除失敗: ${err.message}`);
        }
    }

    /**
     * 清除所有圖片
     */
    static async clearAllImages() {
        try {
            const images = await this.getAllImages();

            for (const image of images) {
                try {
                    await fbService.deleteFile(image.path);
                } catch {}
            }

            await fbService.delete('/images');
            await this.recordHistory('清除所有圖片', '');
        } catch (err) {
            throw new Error(`清除失敗: ${err.message}`);
        }
    }

    /**
     * 記錄到編輯歷史
     */
    static async recordHistory(type, detail) {
        const session = sessionManager.getSession();
        await fbService.append('/editHistory', {
            type: '圖片',
            action: type,
            detail,
            user: session?.userName || 'unknown',
            ipAddress: session?.ipAddress || 'unknown',
            timestamp: new Date().toISOString(),
        });
    }
}

// ═══════════════════════════════════════
//  EDIT HISTORY MANAGER
// ═══════════════════════════════════════
class EditHistoryManager {
    /**
     * 取得編輯歷史
     */
    static async getHistory(limit = 100) {
        try {
            const history = await fbService.read('/editHistory', 'editHistory');
            if (!history) return [];

            return Object.entries(history)
                .map(([id, h]) => ({ id, ...h }))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);
        } catch (err) {
            console.error('Failed to load history:', err);
            return [];
        }
    }

    /**
     * 清除編輯歷史
     */
    static async clearHistory() {
        try {
            await fbService.delete('/editHistory');
            await AuditLogManager.recordAction('清除編輯歷史');
        } catch (err) {
            throw new Error(`清除失敗: ${err.message}`);
        }
    }
}

// ═══════════════════════════════════════
//  AUDIT LOG MANAGER
// ═══════════════════════════════════════
class AuditLogManager {
    /**
     * 記錄操作
     */
    static async recordAction(action, details = {}) {
        const session = sessionManager.getSession();
        const logEntry = {
            action,
            details,
            user: session?.userName || 'unknown',
            userId: session?.userId || 'unknown',
            ipAddress: session?.ipAddress || 'unknown',
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
        };

        try {
            await fbService.append('/auditLog', logEntry);
        } catch (err) {
            console.error('Failed to record audit log:', err);
        }
    }

    /**
     * 取得稽核日誌
     */
    static async getAuditLog(limit = 100) {
        try {
            const logs = await fbService.read('/auditLog', 'auditLog');
            if (!logs) return [];

            return Object.entries(logs)
                .map(([id, log]) => ({ id, ...log }))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);
        } catch (err) {
            console.error('Failed to load audit log:', err);
            return [];
        }
    }

    /**
     * 清除稽核日誌
     */
    static async clearAuditLog() {
        try {
            await fbService.delete('/auditLog');
        } catch (err) {
            throw new Error(`清除失敗: ${err.message}`);
        }
    }
}

// ═══════════════════════════════════════
//  SECURITY LOG MANAGER
// ═══════════════════════════════════════
class SecurityLogManager {
    /**
     * 記錄安全事件
     */
    static async recordEvent(eventType, details = {}) {
        const session = sessionManager.getSession();
        const logEntry = {
            eventType,
            details,
            user: session?.userName || 'unknown',
            ipAddress: session?.ipAddress || 'unknown',
            timestamp: new Date().toISOString(),
        };

        try {
            await fbService.append('/security/log', logEntry);
        } catch (err) {
            console.error('Failed to record security log:', err);
        }
    }

    /**
     * 取得安全日誌
     */
    static async getSecurityLog(limit = 100) {
        try {
            const logs = await fbService.read('/security/log', 'securityLog');
            if (!logs) return [];

            return Object.entries(logs)
                .map(([id, log]) => ({ id, ...log }))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, limit);
        } catch (err) {
            console.error('Failed to load security log:', err);
            return [];
        }
    }

    /**
     * 清除安全日誌
     */
    static async clearSecurityLog() {
        try {
            await fbService.delete('/security/log');
        } catch (err) {
            throw new Error(`清除失敗: ${err.message}`);
        }
    }
}

// ═══════════════════════════════════════
//  VISIT ANALYTICS
// ═══════════════════════════════════════
class VisitAnalytics {
    /**
     * 取得訪客統計
     */
    static async getVisitStats() {
        try {
            const visits = await fbService.read('/visits', 'visits');
            return {
                total: visits?.total || 0,
                today: visits?.today || 0,
                lastVisit: visits?.lastVisit || null,
                daily: visits?.daily || {},
                sources: visits?.sources || {},
            };
        } catch (err) {
            console.error('Failed to load visit stats:', err);
            return {
                total: 0,
                today: 0,
                lastVisit: null,
                daily: {},
                sources: {},
            };
        }
    }

    /**
     * 匯出統計資料 (CSV)
     */
    static async exportAnalytics() {
        const stats = await this.getVisitStats();
        let csv = 'Date,Visits\n';

        const daily = stats.daily || {};
        Object.keys(daily).sort().forEach(d => {
            csv += `${d},${daily[d]}\n`;
        });

        csv += '\nSource,Count\n';
        const sources = stats.sources || {};
        Object.entries(sources).forEach(([s, c]) => {
            csv += `${s},${c}\n`;
        });

        return csv;
    }
}

// ═══════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════
window.AnnouncementManager = AnnouncementManager;
window.ContentManager = ContentManager;
window.ThemeManager = ThemeManager;
window.ImageManager = ImageManager;
window.EditHistoryManager = EditHistoryManager;
window.AuditLogManager = AuditLogManager;
window.SecurityLogManager = SecurityLogManager;
window.VisitAnalytics = VisitAnalytics;
