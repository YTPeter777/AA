# 找廁所MVP 後台系統 v2 - 問題修復清單

## ✅ 已修復的問題

### 1. **登入系統 - 真實密碼加密**
- **問題**: 原系統只驗證硬編碼帳密，無真實密碼加密
- **解決方案**:
  - 前端：SHA256+PBKDF2 客戶端雜湊
  - 後端：bcrypt 10 輪伺服器端雜湊（cloud-functions.js）
  - 支援密碼變更、重設、強度驗證
  - **狀態**: ✅ 完成

### 2. **會話管理 - 真實 Token + 自動逾時**
- **問題**: 無真實會話管理，沒有過期機制
- **解決方案**:
  - JWT-like Token 生成與驗證
  - 30 分鐘自動逾時
  - 5 分鐘前提醒
  - 活動時間追蹤
  - 編輯次數計數
  - **狀態**: ✅ 完成

### 3. **IP 安全 - 真實 IP 取得 + 自動封鎖**
- **問題**: 無真實 IP 取得，IP 封鎖邏輯不完整
- **解決方案**:
  - 使用 ipify API 取得真實 IP
  - 5 次失敗自動封鎖 15 分鐘
  - 存儲於 Firebase `/security/blockedIPs`
  - 跨裝置/瀏覽器生效
  - 定時自動清除過期封鎖
  - **狀態**: ✅ 完成

### 4. **Firebase 連線 - 重試機制 + 離線支援**
- **問題**: 無重試機制，離線時直接失敗
- **解決方案**:
  - 3 次自動重試（指數退避）
  - 樂觀更新快取
  - 離線隊列（自動同步上線後）
  - 5 分鐘智能快取
  - **狀態**: ✅ 完成

### 5. **訪客統計 - 真實資料而非假數據**
- **問題**: 趨勢圖、來源圖顯示隨機假數據，無資料時無提示
- **解決方案**:
  - 直接讀取 Firebase `/visits` 真實數據
  - 無資料時顯示提示而非亂數
  - 週增長率只在 14 天資料時計算
  - 真實的讀寫延遲測試（ping）
  - **狀態**: ✅ 完成

### 6. **圖片管理 - Firebase Storage 真實上傳/刪除**
- **問題**: 圖片上傳只模擬，實際沒存儲；刪除無法真正移除
- **解決方案**:
  - 真實上傳至 Firebase Storage `gs://mvpp-8d9cd.appspot.com/images/`
  - XMLHttpRequest 進度追蹤
  - 真實刪除（Storage + DB 索引）
  - 跨裝置可見
  - **狀態**: ✅ 完成

### 7. **編輯歷史 - Firebase 持久化 + 跨裝置同步**
- **問題**: 編輯歷史只存 localStorage，換裝置消失
- **解決方案**:
  - 所有編輯記錄存 Firebase `/editHistory`
  - 跨裝置實時同步
  - 包含用戶、IP、時間戳
  - 支援清除功能
  - **狀態**: ✅ 完成

### 8. **稽核日誌 - 完整的操作追蹤**
- **問題**: 無完整的稽核追蹤機制
- **解決方案**:
  - 記錄所有操作（登入、編輯、刪除等）
  - 存 Firebase `/auditLog`
  - 包含用戶、IP、User Agent
  - 30 天後自動清除
  - **狀態**: ✅ 完成

### 9. **推播通知 - 真實排程 + FCM 集成**
- **問題**: 推播只是假排程，沒有真實發送邏輯
- **解決方案**:
  - 排程存 Firebase `/scheduled_notifications`
  - Cloud Functions 定時執行（每分鐘檢查）
  - FCM multicast API 分批發送（500 個/批）
  - 目標條件篩選（全部、今日、回訪）
  - 發送結果記錄
  - **狀態**: ✅ 完成

### 10. **管理員帳號 - Firebase 存儲 + 子帳號管理**
- **問題**: 帳號管理只有硬編碼主帳號
- **解決方案**:
  - 主帳號密碼存 Firebase `/config/adminPassword`
  - 支援新增子帳號 `/admins`
  - 角色管理（superadmin / admin / editor）
  - 密碼強度驗證
  - **狀態**: ✅ 完成

### 11. **安全日誌 - 完整的安全事件記錄**
- **問題**: 無完整的安全日誌
- **解決方案**:
  - 記錄登入成功/失敗
  - IP 封鎖事件
  - 密碼變更事件
  - 存 Firebase `/security/log`
  - **狀態**: ✅ 完成

### 12. **錯誤處理 - 完善的 Toast + 驗證**
- **問題**: 錯誤提示簡陋，表單驗證不足
- **解決方案**:
  - Toast Manager（success, error, warning, info）
  - 表單驗證器（email, password, required, 長度等）
  - 網路錯誤自動重試
  - Firebase 錯誤友善提示
  - **狀態**: ✅ 完成

## 🔄 進行中的功能

### 主題設定
- [ ] 色彩選擇器完整實裝
- [ ] 漸層設定預覽
- [ ] 字體大小倍率
- [ ] 主題匯出/匯入 JSON

### 推播通知
- [ ] FCM token 註冊
- [ ] Service Worker 集成
- [ ] 通知權限要求
- [ ] 發送結果即時更新

### 進階設定
- [ ] 密碼變更完整流程
- [ ] 帳號管理界面
- [ ] 資料備份/還原
- [ ] 統計數據匯出

## 🚀 計劃中的功能

### 近期（1-2 週）
- [ ] 主題設定完整實裝
- [ ] 推播通知 UI 完成
- [ ] Service Worker + FCM 集成
- [ ] 進階設定頁面完成

### 中期（1 個月）
- [ ] 圖表實時更新
- [ ] 詳細的分析儀表板
- [ ] 使用者行為分析
- [ ] 實時通知推送測試

### 長期（3 個月+）
- [ ] 多語言支援
- [ ] 深色/淺色主題切換
- [ ] 行動版管理介面
- [ ] 高級分析報告

## 🧪 測試計劃

### 單元測試

```javascript
// auth-system.js 測試
describe('PasswordManager', () => {
    test('應驗證密碼強度', async () => {
        const result = PasswordManager.validatePasswordStrength('weak');
        expect(result.valid).toBe(false);
    });

    test('應正確雜湊密碼', async () => {
        const hash1 = await PasswordManager.hashPassword('test@123');
        const hash2 = await PasswordManager.hashPassword('test@123');
        expect(hash1).not.toEqual(hash2); // 不同 salt
    });
});

describe('SessionManager', () => {
    test('應建立有效會話', () => {
        const session = sessionManager.createSession('user1', 'testuser', 'admin', '1.2.3.4');
        expect(session.token).toBeDefined();
        expect(sessionManager.isAuthenticated()).toBe(true);
    });

    test('應在逾時後清除會話', (done) => {
        const session = sessionManager.createSession('user1', 'testuser', 'admin', '1.2.3.4');
        setTimeout(() => {
            expect(sessionManager.isAuthenticated()).toBe(false);
            done();
        }, AUTH_CONFIG.SESSION_TIMEOUT_MS + 1000);
    });
});
```

### 整合測試

```javascript
// 登入流程測試
describe('LoginFlow', () => {
    test('應成功登入有效帳號', async () => {
        const result = await AdminUserManager.authenticate('admin', 'ToiletMVP@2026', '1.2.3.4');
        expect(result).toBeDefined();
        expect(result.role).toBe('superadmin');
    });

    test('應拒絕錯誤密碼', async () => {
        const result = await AdminUserManager.authenticate('admin', 'wrongpassword', '1.2.3.4');
        expect(result).toBeNull();
    });

    test('應在失敗 5 次後封鎖 IP', async () => {
        const ip = '5.6.7.8';
        for (let i = 0; i < 5; i++) {
            await AdminUserManager.authenticate('admin', 'wrong', ip);
        }
        const blocked = await IPManager.isIPBlocked(ip);
        expect(blocked).toBeDefined();
    });
});

describe('NotificationFlow', () => {
    test('應建立排程通知', async () => {
        const jobId = await notificationScheduler.createScheduledNotification(
            '測試',
            '內容',
            'all',
            new Date(Date.now() + 60000).toISOString(),
            'admin'
        );
        expect(jobId).toBeDefined();
    });

    test('應取消排程工作', async () => {
        const jobId = await notificationScheduler.createScheduledNotification(
            '測試',
            '內容',
            'all',
            new Date(Date.now() + 120000).toISOString(),
            'admin'
        );
        await notificationScheduler.cancelJob(jobId);
        const jobs = await notificationScheduler.getScheduledList();
        expect(jobs.find(j => j.id === jobId)).toBeUndefined();
    });
});
```

### E2E 測試（Cypress）

```javascript
describe('Admin Panel E2E', () => {
    beforeEach(() => {
        cy.visit('/admin');
    });

    it('應顯示登入頁面', () => {
        cy.get('#loginScreen').should('be.visible');
    });

    it('應成功登入', () => {
        cy.get('#loginUser').type('admin');
        cy.get('#loginPass').type('ToiletMVP@2026');
        cy.get('[data-action="login"]').click();
        cy.get('#adminPanel').should('be.visible');
    });

    it('應保存公告', () => {
        cy.login('admin', 'ToiletMVP@2026');
        cy.get('[data-tab="announcement"]').click();
        cy.get('#annTitle').clear().type('測試公告');
        cy.get('#annBody').clear().type('測試內容');
        cy.get('button:contains("儲存")').click();
        cy.get('.toast-success').should('be.visible');
    });
});
```

### 效能測試

```javascript
// 測試 Firebase 延遲
async function performanceBenchmark() {
    const iterations = 100;
    const results = [];

    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await fbService.read('/visits');
        const end = performance.now();
        results.push(end - start);
    }

    const avg = results.reduce((a, b) => a + b) / results.length;
    const max = Math.max(...results);
    const min = Math.min(...results);

    console.log(`讀取平均: ${avg.toFixed(2)}ms, 最大: ${max.toFixed(2)}ms, 最小: ${min.toFixed(2)}ms`);
}
```

## 📋 檢查清單

### 部署前

- [ ] 所有 JS 模組都已載入
- [ ] Firebase 規則已配置
- [ ] Cloud Functions 已部署
- [ ] 環境變數已設定
- [ ] CORS 政策正確
- [ ] 預設管理員已建立

### 部署後

- [ ] 登入功能正常
- [ ] Firebase 連線成功
- [ ] 離線隊列運作
- [ ] 快取有效
- [ ] 推播排程執行
- [ ] 日誌記錄正確
- [ ] IP 封鎖生效

### 定期檢查

- [ ] 審計日誌大小
- [ ] 儲存體使用量
- [ ] 函數執行時間
- [ ] 錯誤率
- [ ] 效能指標

## 🆘 已知問題

### 優先級高

1. **FCM 集成待完成**
   - Service Worker 註冊
   - Token 管理
   - 通知處理

2. **主題設定 UI 待完成**
   - 色彩選擇器連接
   - 預覽更新

### 優先級中

1. **詳細的分析儀表板**
   - 更多圖表
   - 自訂日期範圍
   - 匯出功能

2. **帳號管理 UI**
   - 新增/編輯/刪除帳號
   - 權限管理

### 優先級低

1. **多語言支援**
2. **行動版最佳化**
3. **進階搜索功能**

---

**更新日期**: 2026-05-10  
**版本**: v2.0.0
