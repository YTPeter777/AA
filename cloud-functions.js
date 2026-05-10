/**
 * Firebase Cloud Functions
 * 部署方式：firebase deploy --only functions
 * 
 * 需要安裝：
 * - npm install firebase-functions firebase-admin bcryptjs node-cron
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const cron = require('node-cron');

// 初始化 Firebase
admin.initializeApp();
const db = admin.database();
const messaging = admin.messaging();

// ═══════════════════════════════════════
//  PASSWORD MANAGEMENT
// ═══════════════════════════════════════

/**
 * 密碼雜湊函數
 */
async function hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

/**
 * 驗證密碼
 */
async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

/**
 * HTTP 函數：更新管理員密碼
 */
exports.updateAdminPassword = functions.https.onRequest(async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const { currentPassword, newPassword, adminId } = req.body;

        if (!currentPassword || !newPassword || !adminId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 取得目前密碼
        const adminRef = await db.ref(`/admins/${adminId}`).once('value');
        const admin = adminRef.val();

        if (!admin) {
            return res.status(404).json({ error: 'Admin not found' });
        }

        // 驗證目前密碼
        const isValid = await verifyPassword(currentPassword, admin.passwordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // 雜湊新密碼
        const newHash = await hashPassword(newPassword);

        // 更新資料庫
        await db.ref(`/admins/${adminId}`).update({
            passwordHash: newHash,
            lastPasswordChange: admin.firebaseio.com.timestamp.ServerValue.TIMESTAMP,
        });

        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════
//  NOTIFICATION SCHEDULING & SENDING
// ═══════════════════════════════════════

/**
 * 每分鐘檢查待發送的通知
 */
exports.checkScheduledNotifications = functions
    .pubsub
    .schedule('every 1 minutes')
    .onRun(async (context) => {
        try {
            const now = admin.database.ServerValue.TIMESTAMP;
            const snapshot = await db.ref('/scheduled_notifications')
                .orderByChild('sendAt')
                .endAt(new Date().toISOString())
                .once('value');

            const jobs = snapshot.val();
            if (!jobs) return;

            for (const [jobId, job] of Object.entries(jobs)) {
                if (job.status === 'pending' && new Date(job.sendAt) <= new Date()) {
                    await executeNotificationJob(jobId, job);
                }
            }
        } catch (error) {
            console.error('Error checking scheduled notifications:', error);
        }
    });

/**
 * 執行通知任務
 */
async function executeNotificationJob(jobId, jobData) {
    try {
        // 取得目標 tokens
        const tokens = await getTargetTokens(jobData.target);
        if (tokens.length === 0) {
            await updateJobStatus(jobId, 'completed', 'No target tokens');
            return;
        }

        // 分批發送
        const batchSize = 500;
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < tokens.length; i += batchSize) {
            const batch = tokens.slice(i, i + batchSize);
            const result = await sendNotificationBatch(jobData, batch);
            successCount += result.successCount;
            failureCount += result.failureCount;
        }

        // 記錄結果
        await db.ref('/notification_results').push({
            jobId,
            title: jobData.title,
            target: jobData.target,
            sentAt: admin.database.ServerValue.TIMESTAMP,
            totalTargets: tokens.length,
            successCount,
            failureCount,
        });

        // 更新工作狀態
        await updateJobStatus(jobId, 'sent', `Sent to ${successCount} devices`);
    } catch (error) {
        console.error(`Error executing notification job ${jobId}:`, error);
        await updateJobStatus(jobId, 'failed', error.message);
    }
}

/**
 * 發送通知到一批 tokens
 */
async function sendNotificationBatch(jobData, tokens) {
    const message = {
        notification: {
            title: jobData.title,
            body: jobData.body,
        },
        data: {
            jobId: jobData.jobId || '',
            sentAt: new Date().toISOString(),
        },
    };

    let successCount = 0;
    let failureCount = 0;

    // 使用 multicast 發送到多個 tokens（效率高）
    try {
        const response = await messaging.sendMulticast({
            ...message,
            tokens,
        });

        successCount = response.successCount;
        failureCount = response.failureCount;

        // 處理失敗的 tokens（可能是無效或已過期）
        if (response.failureCount > 0) {
            const failedTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    failedTokens.push(tokens[idx]);
                }
            });
            console.log('Failed tokens:', failedTokens);
            // 可以選擇刪除無效的 tokens
        }
    } catch (error) {
        failureCount = tokens.length;
        console.error('Multicast error:', error);
    }

    return { successCount, failureCount };
}

/**
 * 根據目標條件取得 FCM tokens
 */
async function getTargetTokens(target) {
    try {
        const visitsSnapshot = await db.ref('/visits/tokens').once('value');
        const tokens = visitsSnapshot.val();

        if (!tokens) return [];

        const allTokens = Object.keys(tokens);

        switch (target) {
            case 'all':
                return allTokens;

            case 'today': {
                const today = new Date().toISOString().split('T')[0];
                return allTokens.filter(tokenKey => {
                    const token = tokens[tokenKey];
                    return token.lastVisit && token.lastVisit.startsWith(today);
                });
            }

            case 'returning': {
                return allTokens.filter(tokenKey => {
                    const token = tokens[tokenKey];
                    return (token.visitCount || 0) >= 2;
                });
            }

            default:
                return [];
        }
    } catch (error) {
        console.error('Error getting target tokens:', error);
        return [];
    }
}

/**
 * 更新工作狀態
 */
async function updateJobStatus(jobId, status, detail = '') {
    return db.ref(`/scheduled_notifications/${jobId}`).update({
        status,
        detail,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
    });
}

// ═══════════════════════════════════════
//  AUDIT & SECURITY LOGS
// ═══════════════════════════════════════

/**
 * HTTP 函數：取得審計日誌（分頁）
 */
exports.getAuditLog = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    try {
        const limit = parseInt(req.query.limit || '100');
        const snapshot = await db.ref('/auditLog')
            .orderByChild('timestamp')
            .limitToLast(limit)
            .once('value');

        const logs = snapshot.val();
        if (!logs) {
            return res.status(200).json([]);
        }

        // 反轉陣列以最新優先
        const result = Object.entries(logs)
            .map(([id, log]) => ({ id, ...log }))
            .reverse();

        res.status(200).json(result);
    } catch (error) {
        console.error('Error getting audit log:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * HTTP 函數：清除舊的審計日誌（30 天以前）
 */
exports.cleanupOldAuditLogs = functions
    .pubsub
    .schedule('every 7 days')
    .onRun(async (context) => {
        try {
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            const snapshot = await db.ref('/auditLog').once('value');
            const logs = snapshot.val();

            if (!logs) return;

            let deletedCount = 0;
            for (const [logId, log] of Object.entries(logs)) {
                if (new Date(log.timestamp).getTime() < thirtyDaysAgo) {
                    await db.ref(`/auditLog/${logId}`).remove();
                    deletedCount++;
                }
            }

            console.log(`Cleaned up ${deletedCount} old audit logs`);
        } catch (error) {
            console.error('Error cleaning up audit logs:', error);
        }
    });

// ═══════════════════════════════════════
//  IP BLOCKING & SECURITY
// ═══════════════════════════════════════

/**
 * 定時清除過期的 IP 封鎖
 */
exports.cleanupExpiredIPBlocks = functions
    .pubsub
    .schedule('every 15 minutes')
    .onRun(async (context) => {
        try {
            const snapshot = await db.ref('/security/blockedIPs').once('value');
            const blocked = snapshot.val();

            if (!blocked) return;

            let removedCount = 0;
            for (const [key, blockInfo] of Object.entries(blocked)) {
                if (Date.now() > blockInfo.expiresAt) {
                    await db.ref(`/security/blockedIPs/${key}`).remove();
                    removedCount++;
                }
            }

            console.log(`Removed ${removedCount} expired IP blocks`);
        } catch (error) {
            console.error('Error cleaning up IP blocks:', error);
        }
    });

// ═══════════════════════════════════════
//  DATA BACKUP & ARCHIVAL
// ═══════════════════════════════════════

/**
 * 每日備份重要資料到 Cloud Storage
 */
exports.dailyDataBackup = functions
    .pubsub
    .schedule('every day 02:00')
    .timeZone('Asia/Taipei')
    .onRun(async (context) => {
        try {
            const bucket = admin.storage().bucket();
            const snapshot = await db.ref('/').once('value');
            const data = snapshot.val();

            const filename = `backups/backup-${new Date().toISOString().split('T')[0]}.json`;
            const file = bucket.file(filename);

            await file.save(JSON.stringify(data, null, 2), {
                metadata: {
                    contentType: 'application/json',
                    metadata: {
                        createdAt: new Date().toISOString(),
                    },
                },
            });

            console.log(`Backup created: ${filename}`);
        } catch (error) {
            console.error('Error creating backup:', error);
        }
    });

// ═══════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════
module.exports = {
    updateAdminPassword: exports.updateAdminPassword,
    getAuditLog: exports.getAuditLog,
    checkScheduledNotifications: exports.checkScheduledNotifications,
    cleanupExpiredIPBlocks: exports.cleanupExpiredIPBlocks,
    cleanupOldAuditLogs: exports.cleanupOldAuditLogs,
    dailyDataBackup: exports.dailyDataBackup,
};
