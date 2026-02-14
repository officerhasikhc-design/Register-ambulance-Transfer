/**
 * UI Optimizer - محسن واجهة المستخدم
 * Optimistic UI updates and instant feedback for better UX
 * 
 * Features:
 * 1. Optimistic updates (show changes before server confirms)
 * 2. Loading states with skeleton screens
 * 3. Instant button feedback
 * 4. Smart error recovery
 * 5. Progress indicators
 */

const UIOptimizer = {
    /**
     * Show optimistic update - update UI immediately, revert on error
     */
    optimisticUpdate(updateFn, requestPromise, revertFn) {
        // Apply update immediately
        updateFn();

        // Handle request result
        requestPromise
            .then(() => {
                // Success - update is already applied
                console.log('UIOptimizer: Optimistic update confirmed');
            })
            .catch((error) => {
                // Error - revert the update
                console.error('UIOptimizer: Optimistic update failed, reverting', error);
                if (revertFn) revertFn();
                this.showError('حدث خطأ، يرجى المحاولة مرة أخرى');
            });
    },

    /**
     * Instant button feedback
     */
    buttonFeedback(button, action, options = {}) {
        const originalText = button.innerHTML;
        const originalDisabled = button.disabled;
        
        // Disable button and show loading
        button.disabled = true;
        button.style.opacity = '0.7';
        button.style.cursor = 'not-allowed';
        
        if (options.loadingText) {
            button.innerHTML = options.loadingText;
        } else {
            button.innerHTML = '<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> ' + 
                              (options.loadingLabel || 'جاري المعالجة...');
        }

        // Execute action
        const promise = typeof action === 'function' ? action() : action;

        promise
            .then((result) => {
                // Success feedback
                button.innerHTML = options.successText || '✓ تم بنجاح';
                button.style.background = '#10b981';
                button.style.color = 'white';
                
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.disabled = originalDisabled;
                    button.style.opacity = '';
                    button.style.cursor = '';
                    button.style.background = '';
                    button.style.color = '';
                }, options.successDuration || 1500);

                return result;
            })
            .catch((error) => {
                // Error feedback
                button.innerHTML = options.errorText || '✗ فشل';
                button.style.background = '#ef4444';
                button.style.color = 'white';
                
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.disabled = originalDisabled;
                    button.style.opacity = '';
                    button.style.cursor = '';
                    button.style.background = '';
                    button.style.color = '';
                }, options.errorDuration || 2000);

                throw error;
            });

        return promise;
    },

    /**
     * Show loading overlay
     */
    showLoading(message = 'جاري التحميل...', target = document.body) {
        const overlay = document.createElement('div');
        overlay.id = 'ui-loading-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            backdrop-filter: blur(2px);
        `;

        overlay.innerHTML = `
            <div style="
                background: white;
                padding: 30px 40px;
                border-radius: 16px;
                text-align: center;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                max-width: 300px;
            ">
                <div style="
                    width: 50px;
                    height: 50px;
                    border: 4px solid #e5e7eb;
                    border-top-color: #1e40af;
                    border-radius: 50%;
                    margin: 0 auto 20px;
                    animation: spin 0.8s linear infinite;
                "></div>
                <p style="
                    margin: 0;
                    color: #1f2937;
                    font-size: 16px;
                    font-weight: 600;
                ">${message}</p>
            </div>
        `;

        // Add spin animation if not exists
        if (!document.getElementById('ui-spin-animation')) {
            const style = document.createElement('style');
            style.id = 'ui-spin-animation';
            style.textContent = `
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        target.appendChild(overlay);
        return overlay;
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('ui-loading-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.2s';
            setTimeout(() => overlay.remove(), 200);
        }
    },

    /**
     * Show success message
     */
    showSuccess(message, duration = 3000) {
        this.showToast(message, 'success', duration);
    },

    /**
     * Show error message
     */
    showError(message, duration = 4000) {
        this.showToast(message, 'error', duration);
    },

    /**
     * Show info message
     */
    showInfo(message, duration = 3000) {
        this.showToast(message, 'info', duration);
    },

    /**
     * Show toast notification
     */
    showToast(message, type = 'info', duration = 3000) {
        const container = this.getToastContainer();
        
        const toast = document.createElement('div');
        toast.className = `ui-toast ui-toast-${type}`;
        
        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };

        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        toast.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 300px;
            max-width: 500px;
            border-right: 4px solid ${colors[type]};
            animation: slideInRight 0.3s ease;
            direction: rtl;
        `;

        toast.innerHTML = `
            <div style="
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: ${colors[type]};
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                font-weight: bold;
                flex-shrink: 0;
            ">${icons[type]}</div>
            <div style="
                flex: 1;
                color: #1f2937;
                font-size: 14px;
                font-weight: 500;
            ">${message}</div>
        `;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    /**
     * Get or create toast container
     */
    getToastContainer() {
        let container = document.getElementById('ui-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ui-toast-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                left: 20px;
                z-index: 100000;
                display: flex;
                flex-direction: column;
            `;
            document.body.appendChild(container);

            // Add animations
            if (!document.getElementById('ui-toast-animations')) {
                const style = document.createElement('style');
                style.id = 'ui-toast-animations';
                style.textContent = `
                    @keyframes slideInRight {
                        from {
                            transform: translateX(-100%);
                            opacity: 0;
                        }
                        to {
                            transform: translateX(0);
                            opacity: 1;
                        }
                    }
                    @keyframes slideOutRight {
                        from {
                            transform: translateX(0);
                            opacity: 1;
                        }
                        to {
                            transform: translateX(-100%);
                            opacity: 0;
                        }
                    }
                `;
                document.head.appendChild(style);
            }
        }
        return container;
    },

    /**
     * Create skeleton loader
     */
    createSkeleton(config = {}) {
        const skeleton = document.createElement('div');
        skeleton.className = 'ui-skeleton';
        skeleton.style.cssText = `
            background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
            border-radius: ${config.borderRadius || '8px'};
            width: ${config.width || '100%'};
            height: ${config.height || '20px'};
            margin: ${config.margin || '0'};
        `;

        // Add shimmer animation
        if (!document.getElementById('ui-shimmer-animation')) {
            const style = document.createElement('style');
            style.id = 'ui-shimmer-animation';
            style.textContent = `
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
            `;
            document.head.appendChild(style);
        }

        return skeleton;
    },

    /**
     * Show skeleton screen
     */
    showSkeleton(container, count = 3) {
        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const item = document.createElement('div');
            item.style.cssText = 'padding: 16px; margin-bottom: 12px; background: white; border-radius: 12px;';
            
            item.appendChild(this.createSkeleton({ width: '60%', height: '24px', margin: '0 0 12px 0' }));
            item.appendChild(this.createSkeleton({ width: '100%', height: '16px', margin: '0 0 8px 0' }));
            item.appendChild(this.createSkeleton({ width: '80%', height: '16px' }));
            
            container.appendChild(item);
        }
    },

    /**
     * Smooth scroll to element
     */
    scrollTo(element, offset = 0) {
        const targetPosition = element.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
    },

    /**
     * Disable form during submission
     */
    disableForm(form, message = 'جاري الإرسال...') {
        const elements = form.querySelectorAll('input, select, textarea, button');
        elements.forEach(el => {
            el.disabled = true;
            el.style.opacity = '0.6';
        });

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.dataset.originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = `<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> ${message}`;
        }
    },

    /**
     * Enable form after submission
     */
    enableForm(form) {
        const elements = form.querySelectorAll('input, select, textarea, button');
        elements.forEach(el => {
            el.disabled = false;
            el.style.opacity = '';
        });

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn && submitBtn.dataset.originalText) {
            submitBtn.innerHTML = submitBtn.dataset.originalText;
        }
    }
};

// Make globally available
if (typeof window !== 'undefined') {
    window.UIOptimizer = UIOptimizer;
}
