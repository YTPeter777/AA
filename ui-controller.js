/**
 * UI Controller Layer
 * 連接 HTML UI 和業務邏輯層
 * 包含：表單驗證、事件處理、狀態同步、錯誤處理
 */

// ═══════════════════════════════════════
//  TOAST SYSTEM
// ═══════════════════════════════════════
class ToastManager {
    constructor() {
        this.container = null;
    }

    init() {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = `
                position: fixed;
                top: 1.5rem;
                right: 1.5rem;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            `;
            document.body.appendChild(container);
        }
        this.container = container;
    }

    show(message, type = 'info', duration = 3000) {
        if (!this.container) this.init();

        const icons = {
            success: 'fa-circle-check',
            error: 'fa-circle-xmark',
            info: 'fa-circle-info',
            warning: 'fa-triangle-exclamation',
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.85rem 1.25rem;
            border-radius: 0.75rem;
            font-weight: 700;
            font-size: 0.82rem;
            backdrop-filter: blur(20px);
            border: 1px solid;
            animation: slideIn 0.3s ease-out;
            max-width: 300px;
        `;

        const typeStyles = {
            success: {
                background: 'rgba(34,197,94,0.15)',
                borderColor: 'rgba(34,197,94,0.3)',
                color: '#86efac',
            },
            error: {
                background: 'rgba(239,68,68,0.15)',
                borderColor: 'rgba(239,68,68,0.3)',
                color: '#fca5a5',
            },
            info: {
                background: 'rgba(56,189,248,0.15)',
                borderColor: 'rgba(56,189,248,0.3)',
                color: '#7dd3fc',
            },
            warning: {
                background: 'rgba(245,158,11,0.15)',
                borderColor: 'rgba(245,158,11,0.3)',
                color: '#fcd34d',
            },
        };

        const style = typeStyles[type] || typeStyles.info;
        Object.assign(toast.style, style);

        toast.innerHTML = `
            <i class="fa-solid ${icons[type] || icons.info}"></i>
            <span>${message}</span>
        `;

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    success(message, duration = 3000) {
        this.show(message, 'success', duration);
    }

    error(message, duration = 5000) {
        this.show(message, 'error', duration);
    }

    info(message, duration = 3000) {
        this.show(message, 'info', duration);
    }

    warning(message, duration = 4000) {
        this.show(message, 'warning', duration);
    }
}

const toast = new ToastManager();

// ═══════════════════════════════════════
//  FORM VALIDATOR
// ═══════════════════════════════════════
class FormValidator {
    static validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    static validatePassword(password) {
        return PasswordManager.validatePasswordStrength(password);
    }

    static validateUsername(username) {
        if (!username) return { valid: false, error: '帳號不能為空' };
        if (username.length < 3) return { valid: false, error: '帳號至少 3 個字符' };
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            return { valid: false, error: '帳號只能包含字母、數字、- 和 _' };
        }
        return { valid: true };
    }

    static validateRequired(value, fieldName) {
        if (!value || value.trim() === '') {
            return { valid: false, error: `${fieldName}不能為空` };
        }
        return { valid: true };
    }

    static validateMinLength(value, min, fieldName) {
        if (value.length < min) {
            return { valid: false, error: `${fieldName}至少 ${min} 個字符` };
        }
        return { valid: true };
    }

    static validateMaxLength(value, max, fieldName) {
        if (value.length > max) {
            return { valid: false, error: `${fieldName}最多 ${max} 個字符` };
        }
        return { valid: true };
    }
}

// ═══════════════════════════════════════
//  LOGIN CONTROLLER
// ═══════════════════════════════════════
class LoginController {
    constructor() {
        this.isLoading = false;
        this.attemptCount = 0;
        this.clientIP = 'unknown';
        this.initEventListeners();
        this.getClientIP();
    }

    initEventListeners() {
        const loginBtn = document.querySelector('[data-action="login"]');
        const passwordInput = document.getElementById('loginPass');

        if (loginBtn) loginBtn.addEventListener('click', () => this.login());
        if (passwordInput) passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.login();
        });
    }

    async getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            this.clientIP = data.ip || 'unknown';
        } catch {
            this.clientIP = 'unknown';
        }
    }

    async login() {
        if (this.isLoading) return;

        const usernameInput = document.getElementById('loginUser');
        const passwordInput = document.getElementById('loginPass');

        const username = usernameInput?.value.trim() || '';
        const password = passwordInput?.value || '';

        // 驗證輸入
        if (!username || !password) {
            toast.error('請輸入帳號和密碼');
            return;
        }

        // 檢查 IP 封鎖
        const blockInfo = await IPManager.isIPBlocked(this.clientIP);
        if (blockInfo) {
            const remaining = Math.ceil((blockInfo.expiresAt - Date.now()) / 1000);
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            toast.error(`IP 已封鎖，請在 ${mins}:${String(secs).padStart(2, '0')} 後重試`);
            await AuditLogManager.recordAction('blocked_login_attempt', {
                username,
                reason: 'IP 仍在封鎖期間',
            });
            return;
        }

        this.isLoading = true;
        try {
            const result = await AdminUserManager.authenticate(username, password, this.clientIP);

            if (result) {
                // 登入成功
                const session = sessionManager.createSession(
                    result.userId,
                    result.userName,
                    result.role,
                    result.ipAddress
                );

                await IPManager.recordLoginAttempt(username, this.clientIP, true);
                await SecurityLogManager.recordEvent('login_success', {
                    username,
                    role: result.role,
                });
                await AuditLogManager.recordAction('登入成功', { role: result.role });

                toast.success(`歡迎 ${username}！`);
                setTimeout(() => this.navigateToAdmin(), 500);
            } else {
                // 登入失敗
                const failedAttempts = await IPManager.getFailedAttempts(this.clientIP);

                await IPManager.recordLoginAttempt(username, this.clientIP, false, '帳號或密碼錯誤');
                await SecurityLogManager.recordEvent('login_failure', {
                    username,
                    attemptNumber: failedAttempts.length + 1,
                });

                if (failedAttempts.length + 1 >= AUTH_CONFIG.MAX_LOGIN_ATTEMPTS) {
                    // 達到最大嘗試次數，封鎖 IP
                    await IPManager.blockIP(
                        this.clientIP,
                        `登入失敗 ${AUTH_CONFIG.MAX_LOGIN_ATTEMPTS} 次`
                    );
                    toast.error(`登入失敗次數過多，IP 已被封鎖 15 分鐘`);
                    await SecurityLogManager.recordEvent('ip_blocked', {
                        reason: 'max_login_attempts',
                    });
                } else {
                    const remaining = AUTH_CONFIG.MAX_LOGIN_ATTEMPTS - failedAttempts.length - 1;
                    toast.error(`帳號或密碼錯誤（還有 ${remaining} 次嘗試機會）`);
                }

                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (err) {
            console.error('Login error:', err);
            toast.error(`登入失敗: ${err.message}`);
        } finally {
            this.isLoading = false;
        }
    }

    navigateToAdmin() {
        const loginScreen = document.getElementById('loginScreen');
        const adminPanel = document.getElementById('adminPanel');

        if (loginScreen && adminPanel) {
            loginScreen.style.opacity = '0';
            setTimeout(() => {
                loginScreen.classList.add('hidden');
                adminPanel.classList.remove('hidden');
                this.initAdmin();
            }, 300);
        }
    }

    initAdmin() {
        // 初始化後台 UI
        window.dispatchEvent(new CustomEvent('adminInitialized', {
            detail: { session: sessionManager.getSession() },
        }));
    }
}

// ═══════════════════════════════════════
//  LOGOUT CONTROLLER
// ═══════════════════════════════════════
class LogoutController {
    static logout() {
        if (!confirm('確定要登出嗎？')) return;

        const session = sessionManager.getSession();
        AuditLogManager.recordAction('登出');
        SecurityLogManager.recordEvent('logout');

        sessionManager.clearSession();

        const adminPanel = document.getElementById('adminPanel');
        const loginScreen = document.getElementById('loginScreen');

        if (adminPanel && loginScreen) {
            adminPanel.classList.add('hidden');
            loginScreen.classList.remove('hidden');
            loginScreen.style.opacity = '0';
            setTimeout(() => {
                loginScreen.style.opacity = '1';
            }, 10);
        }

        // 清空表單
        const userInput = document.getElementById('loginUser');
        const passInput = document.getElementById('loginPass');
        if (userInput) userInput.value = '';
        if (passInput) passInput.value = '';
    }
}

// ═══════════════════════════════════════
//  ANNOUNCEMENT CONTROLLER
// ═══════════════════════════════════════
class AnnouncementController {
    static async load() {
        try {
            const announcement = await AnnouncementManager.getAnnouncement();
            document.getElementById('annTitle').value = announcement.title || '';
            document.getElementById('annBody').value = announcement.body || '';
            this.updatePreview();
        } catch (err) {
            toast.error(`載入公告失敗: ${err.message}`);
        }
    }

    static async save() {
        const title = document.getElementById('annTitle').value.trim();
        const body = document.getElementById('annBody').value.trim();

        if (!title) {
            toast.error('請填寫公告標題');
            return;
        }

        try {
            await AnnouncementManager.saveAnnouncement(title, body);
            await AuditLogManager.recordAction('發布公告', { title });
            toast.success('✓ 公告已同步');
            this.updatePreview();
        } catch (err) {
            toast.error(`保存失敗: ${err.message}`);
        }
    }

    static async clear() {
        if (!confirm('確定要清除公告嗎？')) return;

        try {
            await AnnouncementManager.clearAnnouncement();
            document.getElementById('annTitle').value = '';
            document.getElementById('annBody').value = '';
            this.updatePreview();
            toast.info('公告已清除');
        } catch (err) {
            toast.error(`清除失敗: ${err.message}`);
        }
    }

    static async reset() {
        if (!confirm('確定要還原為預設公告嗎？')) return;

        try {
            await AnnouncementManager.resetAnnouncement();
            await this.load();
            toast.info('已還原為預設公告');
        } catch (err) {
            toast.error(`還原失敗: ${err.message}`);
        }
    }

    static updatePreview() {
        const title = document.getElementById('annTitle').value || '（標題預覽）';
        const body = document.getElementById('annBody').value || '（內容預覽）';

        const previewTitle = document.getElementById('previewTitle');
        const previewBody = document.getElementById('previewBody');

        if (previewTitle) previewTitle.textContent = title;
        if (previewBody) previewBody.textContent = body;
    }
}

// ═══════════════════════════════════════
//  CONTENT CONTROLLER
// ═══════════════════════════════════════
class ContentController {
    static async load() {
        try {
            const content = await ContentManager.getAllContent();
            Object.entries(content).forEach(([key, value]) => {
                const input = document.getElementById(key);
                if (input) input.value = value || '';
            });
        } catch (err) {
            toast.error(`載入文案失敗: ${err.message}`);
        }
    }

    static async save() {
        const contentData = {
            heroTitle: document.getElementById('heroTitle').value.trim(),
            tech1Title: document.getElementById('tech1Title').value.trim(),
            tech1Desc: document.getElementById('tech1Desc').value.trim(),
            tech2Title: document.getElementById('tech2Title').value.trim(),
            tech2Desc: document.getElementById('tech2Desc').value.trim(),
            scene1Title: document.getElementById('scene1Title').value.trim(),
            scene1Desc: document.getElementById('scene1Desc').value.trim(),
            scene2Title: document.getElementById('scene2Title').value.trim(),
            scene2Desc: document.getElementById('scene2Desc').value.trim(),
        };

        if (!contentData.heroTitle) {
            toast.error('請填寫主標題');
            return;
        }

        try {
            await ContentManager.saveContent(contentData);
            await AuditLogManager.recordAction('編輯文案');
            toast.success('✓ 文案已同步');
        } catch (err) {
            toast.error(`保存失敗: ${err.message}`);
        }
    }

    static async reset() {
        if (!confirm('確定要還原為預設文案嗎？')) return;

        try {
            await ContentManager.resetContent();
            await this.load();
            toast.info('已還原為預設文案');
        } catch (err) {
            toast.error(`還原失敗: ${err.message}`);
        }
    }
}

// ═══════════════════════════════════════
//  IMAGE CONTROLLER
// ═══════════════════════════════════════
class ImageController {
    static async load() {
        const gallery = document.getElementById('imageGallery');
        if (!gallery) return;

        gallery.innerHTML = '<p style="text-align:center;color:#475569;padding:2.5rem">載入中...</p>';

        try {
            const images = await ImageManager.getAllImages();

            if (images.length === 0) {
                gallery.innerHTML = '<p style="text-align:center;color:#334155;padding:2.5rem">尚無圖片</p>';
                document.getElementById('imgCount').textContent = '0';
                return;
            }

            document.getElementById('imgCount').textContent = images.length;
            gallery.innerHTML = images.map(img => `
                <div style="position:relative;border-radius:0.5rem;overflow:hidden;aspect-ratio:4/3">
                    <img src="${img.url}" style="width:100%;height:100%;object-fit:cover" alt="${img.name}" loading="lazy">
                    <div style="position:absolute;inset:0;background:linear-gradient(transparent,rgba(0,0,0,0.7));display:flex;flex-direction:column;justify-content:flex-end;padding:0.5rem;opacity:0;transition:opacity 0.2s" class="img-hover">
                        <p style="font-size:0.75rem;font-weight:700;color:white;overflow:hidden;text-overflow:ellipsis">${img.name}</p>
                        <button onclick="ImageController.delete('${img.id}','${img.path}')" style="margin-top:0.25rem;background:none;border:none;color:#f87171;font-size:0.75rem;font-weight:700;cursor:pointer">
                            <i class="fa-solid fa-trash"></i> 刪除
                        </button>
                    </div>
                </div>
            `).join('');

            // 加入 hover 效果
            document.querySelectorAll('.img-hover').forEach(el => {
                el.parentElement.addEventListener('mouseenter', () => { el.style.opacity = '1'; });
                el.parentElement.addEventListener('mouseleave', () => { el.style.opacity = '0'; });
            });
        } catch (err) {
            gallery.innerHTML = `<p style="text-align:center;color:#ef4444;padding:2.5rem">載入失敗: ${err.message}</p>`;
        }
    }

    static async handleUpload(input) {
        const files = Array.from(input.files || []);
        if (files.length === 0) return;

        const uploadZone = document.getElementById('uploadZone');
        const progressEl = document.getElementById('uploadProgress');

        uploadZone.style.opacity = '0.5';
        uploadZone.style.pointerEvents = 'none';
        progressEl.classList.remove('hidden');

        let successCount = 0;

        for (const [index, file] of files.entries()) {
            try {
                const progressCallback = (percent) => {
                    const progressBar = document.getElementById('uploadProgressBar');
                    const progressPct = document.getElementById('uploadProgressPct');
                    if (progressBar) progressBar.style.width = percent + '%';
                    if (progressPct) progressPct.textContent = percent + '%';
                };

                await ImageManager.uploadImage(file, progressCallback);
                successCount++;
            } catch (err) {
                toast.error(`${file.name}: ${err.message}`);
            }
        }

        uploadZone.style.opacity = '1';
        uploadZone.style.pointerEvents = 'auto';
        progressEl.classList.add('hidden');
        input.value = '';

        if (successCount > 0) {
            toast.success(`已上傳 ${successCount} 張圖片`);
            await this.load();
        }
    }

    static async delete(imageId, filePath) {
        if (!confirm('確定刪除這張圖片？')) return;

        try {
            await ImageManager.deleteImage(imageId, filePath);
            toast.info('圖片已刪除');
            await this.load();
        } catch (err) {
            toast.error(`刪除失敗: ${err.message}`);
        }
    }

    static async clearAll() {
        if (!confirm('確定清除所有圖片？將永久刪除，無法復原。')) return;

        try {
            await ImageManager.clearAllImages();
            toast.info('所有圖片已清除');
            await this.load();
        } catch (err) {
            toast.error(`清除失敗: ${err.message}`);
        }
    }
}

// ═══════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════
window.toast = toast;
window.FormValidator = FormValidator;
window.LoginController = LoginController;
window.LogoutController = LogoutController;
window.AnnouncementController = AnnouncementController;
window.ContentController = ContentController;
window.ImageController = ImageController;
