/**
 * Session Manager - إدارة الجلسات والحماية
 * Hasik Health Center - Ambulance Activity Log System
 * 
 * Features:
 * 1. Page protection - redirects to login if no valid session
 * 2. Auto-logout on inactivity (30 min for nurses/admin, 60 min for drivers)
 * 3. Session validation and expiry management
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const SESSION_CONFIG = {
        LOGIN_PAGE: 'login.html',
        SESSION_KEY: 'userSession',
        LANGUAGE_KEY: 'appLanguage',

        // Inactivity timeout in milliseconds
        TIMEOUT_NURSE: 30 * 60 * 1000,    // 30 minutes
        TIMEOUT_ADMIN: 30 * 60 * 1000,    // 30 minutes
        TIMEOUT_DRIVER: 60 * 60 * 1000,   // 60 minutes

        // Warning before logout (seconds)
        WARNING_BEFORE_LOGOUT: 60,         // Show warning 60 seconds before logout

        // Events that count as user activity
        ACTIVITY_EVENTS: ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'input']
    };

    // ============================================
    // DETECT CURRENT PAGE
    // ============================================
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const isLoginPage = currentPage === SESSION_CONFIG.LOGIN_PAGE || currentPage === '' || currentPage === 'index.html';

    // ============================================
    // SESSION VALIDATION
    // ============================================
    function getSession() {
        try {
            const sessionStr = localStorage.getItem(SESSION_CONFIG.SESSION_KEY);
            if (!sessionStr) return null;
            return JSON.parse(sessionStr);
        } catch (e) {
            return null;
        }
    }

    function isValidSession(session) {
        if (!session) return false;
        if (!session.staffNumber || !session.type || !session.loginTime) return false;
        return true;
    }

    function getPageType() {
        if (currentPage.includes('admin')) return 'admin';
        if (currentPage.includes('nurse')) return 'nurse';
        if (currentPage.includes('driver')) return 'driver';
        if (currentPage.includes('settings')) return 'admin';
        return null;
    }

    function canAccessPage(session, pageType) {
        if (!session || !pageType) return false;

        // Admin can access everything
        if (session.type === 'admin') return true;

        // Nurse can access nurse page
        if (session.type === 'nurse' && pageType === 'nurse') return true;

        // Driver can access driver page
        if (session.type === 'driver' && pageType === 'driver') return true;

        return false;
    }

    // ============================================
    // PAGE PROTECTION - Runs immediately
    // ============================================
    if (!isLoginPage) {
        const session = getSession();
        const pageType = getPageType();

        if (!isValidSession(session)) {
            // No valid session - redirect to login
            localStorage.removeItem(SESSION_CONFIG.SESSION_KEY);
            window.location.replace(SESSION_CONFIG.LOGIN_PAGE);
            // Stop all further execution
            throw new Error('SESSION_REDIRECT');
        }

        if (!canAccessPage(session, pageType)) {
            // User doesn't have permission for this page
            window.location.replace(SESSION_CONFIG.LOGIN_PAGE);
            throw new Error('SESSION_REDIRECT');
        }
    }

    // ============================================
    // INACTIVITY TRACKER
    // ============================================
    if (!isLoginPage) {
        const session = getSession();
        if (!session) return;

        // Determine timeout based on user type
        let timeoutDuration;
        switch (session.type) {
            case 'driver':
                timeoutDuration = SESSION_CONFIG.TIMEOUT_DRIVER;
                break;
            case 'admin':
                timeoutDuration = SESSION_CONFIG.TIMEOUT_ADMIN;
                break;
            case 'nurse':
            default:
                timeoutDuration = SESSION_CONFIG.TIMEOUT_NURSE;
                break;
        }

        let inactivityTimer = null;
        let warningTimer = null;
        let warningModal = null;
        let countdownInterval = null;

        // Get language
        function getLang() {
            return localStorage.getItem(SESSION_CONFIG.LANGUAGE_KEY) || 'ar';
        }

        // Create warning modal
        function createWarningModal() {
            const lang = getLang();
            const isAr = lang === 'ar';

            const overlay = document.createElement('div');
            overlay.id = 'session-timeout-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.6); z-index: 99999;
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(4px);
                direction: ${isAr ? 'rtl' : 'ltr'};
            `;

            overlay.innerHTML = `
                <div style="
                    background: white; border-radius: 16px; padding: 32px;
                    max-width: 400px; width: 90%; text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    animation: sessionModalIn 0.3s ease;
                ">
                    <div style="font-size: 48px; margin-bottom: 16px;">⏰</div>
                    <h2 style="color: #dc2626; margin: 0 0 12px 0; font-size: 20px;">
                        ${isAr ? 'تنبيه: انتهاء الجلسة' : 'Session Timeout Warning'}
                    </h2>
                    <p style="color: #6b7280; margin: 0 0 8px 0; font-size: 14px; line-height: 1.6;">
                        ${isAr 
                            ? 'سيتم تسجيل خروجك تلقائياً بسبب عدم النشاط' 
                            : 'You will be logged out automatically due to inactivity'}
                    </p>
                    <div id="session-countdown" style="
                        font-size: 36px; font-weight: 700; color: #dc2626;
                        margin: 16px 0; font-family: monospace;
                    ">${SESSION_CONFIG.WARNING_BEFORE_LOGOUT}</div>
                    <p style="color: #9ca3af; font-size: 12px; margin: 0 0 20px 0;">
                        ${isAr ? 'ثانية متبقية' : 'seconds remaining'}
                    </p>
                    <button id="session-stay-btn" style="
                        background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
                        color: white; border: none; padding: 14px 40px;
                        border-radius: 10px; font-size: 16px; font-weight: 600;
                        cursor: pointer; font-family: inherit;
                        box-shadow: 0 4px 15px rgba(30,64,175,0.3);
                        transition: transform 0.2s;
                    ">
                        ${isAr ? 'متابعة العمل' : 'Stay Logged In'}
                    </button>
                </div>
            `;

            // Add animation keyframes
            if (!document.getElementById('session-modal-styles')) {
                const style = document.createElement('style');
                style.id = 'session-modal-styles';
                style.textContent = `
                    @keyframes sessionModalIn {
                        from { opacity: 0; transform: scale(0.9); }
                        to { opacity: 1; transform: scale(1); }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(overlay);

            // Stay button handler
            document.getElementById('session-stay-btn').addEventListener('click', function() {
                dismissWarning();
                resetInactivityTimer();
            });

            return overlay;
        }

        // Show warning
        function showWarning() {
            if (warningModal) return;

            warningModal = createWarningModal();
            let secondsLeft = SESSION_CONFIG.WARNING_BEFORE_LOGOUT;
            const countdownEl = document.getElementById('session-countdown');

            countdownInterval = setInterval(function() {
                secondsLeft--;
                if (countdownEl) countdownEl.textContent = secondsLeft;

                if (secondsLeft <= 0) {
                    clearInterval(countdownInterval);
                    performLogout();
                }
            }, 1000);
        }

        // Dismiss warning
        function dismissWarning() {
            if (warningModal) {
                warningModal.remove();
                warningModal = null;
            }
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
        }

        // Perform logout
        function performLogout() {
            dismissWarning();
            localStorage.removeItem(SESSION_CONFIG.SESSION_KEY);
            window.location.replace(SESSION_CONFIG.LOGIN_PAGE);
        }

        // Reset inactivity timer
        function resetInactivityTimer() {
            // Clear existing timers
            if (inactivityTimer) clearTimeout(inactivityTimer);
            if (warningTimer) clearTimeout(warningTimer);

            // Dismiss any existing warning
            dismissWarning();

            // Set warning timer (fires before logout)
            const warningTime = timeoutDuration - (SESSION_CONFIG.WARNING_BEFORE_LOGOUT * 1000);
            warningTimer = setTimeout(function() {
                showWarning();
            }, warningTime > 0 ? warningTime : timeoutDuration - 10000);

            // Set logout timer
            inactivityTimer = setTimeout(function() {
                performLogout();
            }, timeoutDuration);
        }

        // Listen for user activity
        function setupActivityListeners() {
            // Throttle to avoid excessive timer resets
            let lastActivity = Date.now();
            const THROTTLE_MS = 5000; // Only reset timer every 5 seconds max

            function onActivity() {
                const now = Date.now();
                if (now - lastActivity > THROTTLE_MS) {
                    lastActivity = now;
                    // Only reset if warning is not showing
                    if (!warningModal) {
                        resetInactivityTimer();
                    }
                }
            }

            SESSION_CONFIG.ACTIVITY_EVENTS.forEach(function(eventName) {
                document.addEventListener(eventName, onActivity, { passive: true });
            });

            // Also listen for visibility change (tab switch)
            document.addEventListener('visibilitychange', function() {
                if (!document.hidden) {
                    // Tab became visible - check if session should have expired
                    const session = getSession();
                    if (!isValidSession(session)) {
                        performLogout();
                    }
                }
            });
        }

        // Start everything when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                setupActivityListeners();
                resetInactivityTimer();
            });
        } else {
            setupActivityListeners();
            resetInactivityTimer();
        }
    }

})();
