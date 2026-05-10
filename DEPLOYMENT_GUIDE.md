# 找廁所MVP 後台管理系統 v2 - 完整部署指南

## 📋 目錄結構

```
project/
├── admin/
│   ├── index.html                 # 後台入口（admin-panel-v2.html）
│   ├── firebase-service.js         # Firebase 服務層
│   ├── auth-system.js              # 認證系統
│   ├── notification-system.js      # 推播系統
│   ├── business-logic.js           # 業務邏輯層
│   └── ui-controller.js            # UI 控制層
├── functions/
│   ├── index.js                    # Cloud Functions（cloud-functions.js）
│   └── package.json
├── database.rules.json             # Firebase Realtime DB 規則
├── storage.rules                   # Firebase Storage 規則
└── .env                            # 環境變數
```

## 🚀 快速開始

### 1. 前置準備

```bash
# 安裝 Firebase CLI
npm install -g firebase-tools

# 登入 Firebase
firebase login

# 初始化 Firebase 專案
firebase init
# 選擇：Realtime Database, Cloud Functions, Storage
```

### 2. 設定 Firebase 專案

#### 2.1 Realtime Database 規則（database.rules.json）

```json
{
  "rules": {
    // 公開讀取，管理員寫入
    "announcement": {
      ".read": true,
      ".write": "root.child('config').child('admins').child(auth.uid).exists()"
    },
    "content": {
      ".read": true,
      ".write": "root.child('config').child('admins').child(auth.uid).exists()"
    },
    "theme": {
      ".read": true,
      ".write": "root.child('config').child('admins').child(auth.uid).exists()"
    },

    // 訪客數據：所有人可寫（前端記錄），管理員可讀
    "visits": {
      ".read": "root.child('config').child('admins').child(auth.uid).exists()",
      ".write": true,
      "total": { ".write": true },
      "today": { ".write": true },
      "daily": { ".write": true },
      "sources": { ".write": true },
      "tokens": { ".write": true }
    },

    // 管理員數據
    "admins": {
      ".read": "root.child('config').child('admins').child(auth.uid).exists()",
      ".write": false
    },

    // 編輯歷史
    "editHistory": {
      ".read": "root.child('config').child('admins').child(auth.uid).exists()",
      ".write": "auth.uid != null"
    },

    // 稽核日誌
    "auditLog": {
      ".read": "root.child('config').child('admins').child(auth.uid).exists()",
      ".write": "auth.uid != null"
    },

    // 安全日誌
    "security": {
      ".read": "root.child('config').child('admins').child(auth.uid).exists()",
      ".write": "root.child('config').child('admins').child(auth.uid).exists()",
      "blockedIPs": {
        ".read": "root.child('config').child('admins').child(auth.uid).exists()",
        ".write": "root.child('config').child('admins').child(auth.uid).exists()"
      },
      "log": {
        ".write": true
      }
    },

    // 圖片索引
    "images": {
      ".read": true,
      ".write": "root.child('config').child('admins').child(auth.uid).exists()"
    },

    // 排程通知
    "scheduled_notifications": {
      ".read": "root.child('config').child('admins').child(auth.uid).exists()",
      ".write": "root.child('config').child('admins').child(auth.uid).exists()"
    },

    // 系統設定
    "config": {
      ".read": "root.child('config').child('admins').child(auth.uid).exists()",
      ".write": false
    },

    // 允許無驗證的 system ping（用於連線測試）
    "system": {
      "ping": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

#### 2.2 Firebase Storage 規則（storage.rules）

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // 圖片資料夾：公開讀取，管理員寫入
    match /images/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // 備份資料夾：僅管理員可讀寫
    match /backups/{allPaths=**} {
      allow read, write: if request.auth != null;
    }

    // 拒絕其他存取
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### 3. Cloud Functions 部署

#### 3.1 初始化 functions

```bash
cd functions
npm init -y
npm install firebase-functions firebase-admin bcryptjs node-cron
```

#### 3.2 firebaserc 設定

```bash
firebase use --add

# 選擇你的 Firebase 專案
# 設定別名，如：production
```

#### 3.3 部署 Cloud Functions

```bash
# 部署單個函數
firebase deploy --only functions:updateAdminPassword

# 部署所有函數
firebase deploy --only functions

# 查看日誌
firebase functions:log
```

### 4. 環境變數設定

#### 4.1 .env 檔案

```env
# Firebase Config
VITE_FIREBASE_API_KEY=YOUR_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL=YOUR_DATABASE_URL
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_APP_ID

# FCM Config
VITE_FCM_API_KEY=YOUR_FCM_API_KEY
VITE_FCM_PROJECT_ID=YOUR_PROJECT_ID

# Admin Config
VITE_DEFAULT_ADMIN_PASSWORD=ToiletMVP@2026
VITE_SESSION_TIMEOUT_MS=1800000
VITE_MAX_LOGIN_ATTEMPTS=5
```

#### 4.2 在 HTML 中使用環境變數

```html
<script>
    window.CONFIG = {
        FIREBASE_DATABASE_URL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
        FCM_API_KEY: import.meta.env.VITE_FCM_API_KEY,
    };
</script>
```

### 5. 初始化資料

#### 5.1 建立預設管理員帳號

在 Firebase Console 的 Realtime Database 中手動建立：

```json
{
  "config": {
    "adminPassword": {
      "hash": "BCRYPT_HASH_OF_ToiletMVP@2026",
      "salt": "BCRYPT_SALT",
      "updatedAt": "2026-01-01T00:00:00Z"
    }
  }
}
```

或使用 Cloud Functions HTTP 函數建立。

#### 5.2 建立初始訪客數據

```json
{
  "visits": {
    "total": 0,
    "today": 0,
    "lastVisit": null,
    "daily": {},
    "sources": {}
  }
}
```

### 6. 部署到 Hosting（選項）

```bash
# 部署後台
firebase deploy --only hosting

# 部署特定版本
firebase deploy --only hosting:admin
```

### 7. 驗證部署

#### 7.1 檢查 Firebase 連線

```bash
# 在瀏覽器 Console 中執行
await fbService.ping();
```

#### 7.2 測試登入

- 帳號: `admin`
- 密碼: `ToiletMVP@2026`

#### 7.3 查看日誌

```bash
firebase functions:log --lines=50
```

## 🔐 安全最佳實踐

### 1. 密碼安全

- ✅ 前端使用 SHA256+PBKDF2 雜湊
- ✅ 伺服器端使用 bcrypt（10 輪）
- ✅ 支援密碼變更和重置

### 2. IP 安全

- ✅ 使用 ipify API 取得真實 IP
- ✅ 5 次登入失敗後自動封鎖 15 分鐘
- ✅ 定時清除過期的 IP 封鎖

### 3. 會話管理

- ✅ 30 分鐘自動逾時
- ✅ 活動時間追蹤
- ✅ Token 驗證（JWT-like）

### 4. 稽核追蹤

- ✅ 記錄所有操作（編輯、刪除、登入等）
- ✅ 包含 IP、用戶、時間戳
- ✅ 30 天後自動清除

### 5. 離線隊列

- ✅ 離線時儲存操作
- ✅ 上線後自動同步
- ✅ 可視化隊列狀態

## 🐛 故障排除

### Firebase 連線失敗

```javascript
// 檢查快取
fbService.clearCache();

// 檢查離線隊列
fbService.getOfflineQueueStatus();

// 重試請求
await fbService.fetch(url, options, null, 0);
```

### 推播不工作

1. 檢查 FCM API 金鑰
2. 驗證 Service Worker 註冊
3. 檢查通知權限

### 登入循環

1. 清除 localStorage
2. 檢查密碼雜湊
3. 驗證 Token 簽名

## 📊 監控與維護

### 定期檢查

- [ ] Firebase 配額使用量
- [ ] 儲存體使用量
- [ ] 函數執行時間
- [ ] 日誌儲存空間

### 備份策略

```bash
# 每日自動備份到 Cloud Storage
firebase deploy --only functions:dailyDataBackup
```

### 效能最佳化

1. 啟用快取（預設 5 分鐘）
2. 使用批次寫入
3. 減少讀取操作
4. 定期清理舊資料

## 📞 支持與聯繫

- Firebase 文件：https://firebase.google.com/docs
- 問題報告：GitHub Issues
- 討論區：Firebase Community

---

**版本**: v2.0.0  
**最後更新**: 2026-05-10  
**維護者**: ToiletMVP Team
