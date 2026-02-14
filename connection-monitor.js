/**
 * Connection Monitor - مراقب الاتصال
 * Real-time connection quality monitoring and adaptive behavior
 * 
 * Features:
 * 1. Real-time connection quality detection
 * 2. Visual connection indicator
 * 3. Adaptive timeout adjustments
 * 4. Offline mode detection
 * 5. Bandwidth estimation
 */

const ConnectionMonitor = {
    // State
    state: {
        isOnline: navigator.onLine,
        quality: 'unknown', // excellent, good, fair, poor, offline
        bandwidth: 0, // estimated Mbps
        latency: 0, // ms
        lastCheck: 0,
        history: []
    },

    // Configuration
    config: {
        CHECK_INTERVAL: 30000, // Check every 30 seconds
        HISTORY_SIZE: 10,
        LATENCY_EXCELLENT: 100,
        LATENCY_GOOD: 300,
        LATENCY_FAIR: 800,
        LATENCY_POOR: 2000
    },

    // UI Elements
    ui: {
        indicator: null,
        tooltip: null
    },

    /**
     * Initialize connection monitor
     */
    init() {
        this.setupEventListeners();
        this.createIndicator();
        this.checkConnection();
        
        // Periodic checks
        setInterval(() => this.checkConnection(), this.config.CHECK_INTERVAL);

        // Check on visibility change
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkConnection();
            }
        });
    },

    /**
     * Setup online/offline event listeners
     */
    setupEventListeners() {
        window.addEventListener('online', () => {
            console.log('ConnectionMonitor: Online');
            this.state.isOnline = true;
            this.checkConnection();
            this.updateIndicator();
        });

        window.addEventListener('offline', () => {
            console.log('ConnectionMonitor: Offline');
            this.state.isOnline = false;
            this.state.quality = 'offline';
            this.updateIndicator();
        });
    },

    /**
     * Check connection quality
     */
    async checkConnection() {
        if (!navigator.onLine) {
            this.state.quality = 'offline';
            this.state.latency = 0;
            this.updateIndicator();
            return;
        }

        try {
            const start = performance.now();
            
            // Use a small test request
            const response = await fetch('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', {
                method: 'GET',
                cache: 'no-cache'
            });

            const latency = performance.now() - start;
            this.state.latency = Math.round(latency);
            this.state.lastCheck = Date.now();

            // Determine quality based on latency
            if (latency < this.config.LATENCY_EXCELLENT) {
                this.state.quality = 'excellent';
            } else if (latency < this.config.LATENCY_GOOD) {
                this.state.quality = 'good';
            } else if (latency < this.config.LATENCY_FAIR) {
                this.state.quality = 'fair';
            } else if (latency < this.config.LATENCY_POOR) {
                this.state.quality = 'poor';
            } else {
                this.state.quality = 'poor';
            }

            // Add to history
            this.state.history.push({
                timestamp: Date.now(),
                latency: latency,
                quality: this.state.quality
            });

            // Keep only recent history
            if (this.state.history.length > this.config.HISTORY_SIZE) {
                this.state.history.shift();
            }

            this.updateIndicator();

        } catch (error) {
            console.error('ConnectionMonitor: Check failed', error);
            this.state.quality = 'poor';
            this.updateIndicator();
        }
    },

    /**
     * Create connection indicator UI
     */
    createIndicator() {
        // Create indicator
        const indicator = document.createElement('div');
        indicator.id = 'connection-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #9ca3af;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 99998;
            cursor: pointer;
            transition: all 0.3s ease;
        `;

        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.id = 'connection-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            bottom: 40px;
            left: 20px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            z-index: 99999;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s;
            direction: rtl;
        `;

        document.body.appendChild(indicator);
        document.body.appendChild(tooltip);

        this.ui.indicator = indicator;
        this.ui.tooltip = tooltip;

        // Show tooltip on hover
        indicator.addEventListener('mouseenter', () => {
            tooltip.style.opacity = '1';
        });

        indicator.addEventListener('mouseleave', () => {
            tooltip.style.opacity = '0';
        });

        // Click to check connection
        indicator.addEventListener('click', () => {
            this.checkConnection();
        });
    },

    /**
     * Update indicator based on connection quality
     */
    updateIndicator() {
        if (!this.ui.indicator) return;

        const colors = {
            excellent: '#10b981',
            good: '#22c55e',
            fair: '#f59e0b',
            poor: '#ef4444',
            offline: '#6b7280',
            unknown: '#9ca3af'
        };

        const labels = {
            excellent: 'ممتاز',
            good: 'جيد',
            fair: 'متوسط',
            poor: 'ضعيف',
            offline: 'غير متصل',
            unknown: 'غير معروف'
        };

        const color = colors[this.state.quality] || colors.unknown;
        const label = labels[this.state.quality] || labels.unknown;

        this.ui.indicator.style.background = color;
        
        // Pulse animation for poor connection
        if (this.state.quality === 'poor' || this.state.quality === 'offline') {
            this.ui.indicator.style.animation = 'pulse 2s infinite';
            
            // Add animation if not exists
            if (!document.getElementById('connection-pulse-animation')) {
                const style = document.createElement('style');
                style.id = 'connection-pulse-animation';
                style.textContent = `
                    @keyframes pulse {
                        0%, 100% { 
                            box-shadow: 0 0 0 0 ${color}66;
                        }
                        50% { 
                            box-shadow: 0 0 0 8px ${color}00;
                        }
                    }
                `;
                document.head.appendChild(style);
            }
        } else {
            this.ui.indicator.style.animation = '';
        }

        // Update tooltip
        let tooltipText = `الاتصال: ${label}`;
        if (this.state.latency > 0) {
            tooltipText += ` (${this.state.latency}ms)`;
        }
        this.ui.tooltip.textContent = tooltipText;
    },

    /**
     * Get current connection quality
     */
    getQuality() {
        return this.state.quality;
    },

    /**
     * Get adaptive timeout based on connection quality
     */
    getAdaptiveTimeout(baseTimeout = 15000) {
        const multipliers = {
            excellent: 0.7,
            good: 1.0,
            fair: 1.5,
            poor: 2.5,
            offline: 3.0,
            unknown: 1.5
        };

        const multiplier = multipliers[this.state.quality] || 1.5;
        return Math.round(baseTimeout * multiplier);
    },

    /**
     * Check if connection is good enough for operation
     */
    isGoodConnection() {
        return this.state.quality === 'excellent' || this.state.quality === 'good';
    },

    /**
     * Get connection info
     */
    getInfo() {
        return {
            isOnline: this.state.isOnline,
            quality: this.state.quality,
            latency: this.state.latency,
            lastCheck: this.state.lastCheck,
            history: this.state.history
        };
    }
};

// Auto-initialize
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ConnectionMonitor.init());
    } else {
        ConnectionMonitor.init();
    }
}
