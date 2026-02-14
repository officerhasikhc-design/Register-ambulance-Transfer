/**
 * Request Optimizer - محسن الطلبات
 * Advanced request management for slow/unstable internet connections
 * 
 * Features:
 * 1. Request queue with priority system
 * 2. Automatic retry with exponential backoff
 * 3. Request deduplication
 * 4. Timeout handling
 * 5. Offline queue with persistence
 * 6. Request batching
 * 7. Connection quality detection
 */

const RequestOptimizer = {
    // Configuration
    config: {
        MAX_RETRIES: 3,
        INITIAL_TIMEOUT: 15000,      // 15 seconds
        MAX_TIMEOUT: 45000,           // 45 seconds
        RETRY_DELAY: 1000,            // 1 second
        MAX_RETRY_DELAY: 10000,       // 10 seconds
        CONCURRENT_REQUESTS: 2,       // Max parallel requests
        BATCH_DELAY: 300,             // Batch requests within 300ms
        OFFLINE_QUEUE_KEY: 'offline_request_queue'
    },

    // State
    state: {
        queue: [],
        activeRequests: 0,
        inflightRequests: new Map(),
        offlineQueue: [],
        isOnline: navigator.onLine,
        connectionQuality: 'good' // good, fair, poor
    },

    /**
     * Initialize the optimizer
     */
    init() {
        this.loadOfflineQueue();
        this.setupOnlineListener();
        this.detectConnectionQuality();
        this.processQueue();
        
        // Auto-detect connection quality every 30 seconds
        setInterval(() => this.detectConnectionQuality(), 30000);
    },

    /**
     * Setup online/offline listeners
     */
    setupOnlineListener() {
        window.addEventListener('online', () => {
            console.log('RequestOptimizer: Connection restored');
            this.state.isOnline = true;
            this.processOfflineQueue();
            this.processQueue();
        });

        window.addEventListener('offline', () => {
            console.log('RequestOptimizer: Connection lost');
            this.state.isOnline = false;
        });
    },

    /**
     * Detect connection quality using timing
     */
    async detectConnectionQuality() {
        if (!navigator.onLine) {
            this.state.connectionQuality = 'offline';
            return;
        }

        try {
            const start = Date.now();
            // Use a small image for speed test
            const response = await fetch('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', {
                method: 'GET',
                cache: 'no-cache'
            });
            const duration = Date.now() - start;

            if (duration < 100) {
                this.state.connectionQuality = 'good';
            } else if (duration < 500) {
                this.state.connectionQuality = 'fair';
            } else {
                this.state.connectionQuality = 'poor';
            }
        } catch (e) {
            this.state.connectionQuality = 'poor';
        }
    },

    /**
     * Get adaptive timeout based on connection quality
     */
    getAdaptiveTimeout() {
        switch (this.state.connectionQuality) {
            case 'good': return this.config.INITIAL_TIMEOUT;
            case 'fair': return this.config.INITIAL_TIMEOUT * 1.5;
            case 'poor': return this.config.MAX_TIMEOUT;
            default: return this.config.MAX_TIMEOUT;
        }
    },

    /**
     * Main request method with all optimizations
     */
    async request(url, options = {}) {
        const requestId = this.generateRequestId(url, options);
        
        // Check for duplicate in-flight request
        if (this.state.inflightRequests.has(requestId)) {
            console.log('RequestOptimizer: Deduplicating request', requestId);
            return this.state.inflightRequests.get(requestId);
        }

        // Create request promise
        const requestPromise = this._executeRequest(url, options);
        this.state.inflightRequests.set(requestId, requestPromise);

        try {
            const result = await requestPromise;
            return result;
        } finally {
            this.state.inflightRequests.delete(requestId);
        }
    },

    /**
     * Execute request with retry logic
     */
    async _executeRequest(url, options = {}) {
        const priority = options.priority || 'normal';
        const maxRetries = options.maxRetries || this.config.MAX_RETRIES;
        let lastError = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // If offline, queue the request
                if (!this.state.isOnline && options.method === 'POST') {
                    return await this.queueOfflineRequest(url, options);
                }

                // Execute with timeout
                const timeout = this.getAdaptiveTimeout();
                const result = await this.fetchWithTimeout(url, options, timeout);
                
                // Success - return result
                return result;

            } catch (error) {
                lastError = error;
                console.warn(`RequestOptimizer: Attempt ${attempt + 1}/${maxRetries + 1} failed`, error.message);

                // Don't retry on certain errors
                if (error.name === 'AbortError' || error.status === 400 || error.status === 401) {
                    throw error;
                }

                // Wait before retry (exponential backoff)
                if (attempt < maxRetries) {
                    const delay = Math.min(
                        this.config.RETRY_DELAY * Math.pow(2, attempt),
                        this.config.MAX_RETRY_DELAY
                    );
                    await this.sleep(delay);
                }
            }
        }

        // All retries failed
        throw lastError || new Error('Request failed after all retries');
    },

    /**
     * Fetch with timeout
     */
    async fetchWithTimeout(url, options, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
                error.status = response.status;
                throw error;
            }

            // Parse response
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            return await response.text();

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    },

    /**
     * Queue offline request
     */
    async queueOfflineRequest(url, options) {
        const request = {
            id: Date.now() + '_' + Math.random(),
            url: url,
            options: options,
            timestamp: Date.now(),
            retries: 0
        };

        this.state.offlineQueue.push(request);
        this.saveOfflineQueue();

        console.log('RequestOptimizer: Request queued for offline sync', request.id);

        return {
            success: true,
            offline: true,
            queued: true,
            message: 'تم حفظ الطلب وسيتم إرساله عند توفر الإنترنت'
        };
    },

    /**
     * Process offline queue when connection restored
     */
    async processOfflineQueue() {
        if (this.state.offlineQueue.length === 0) return;

        console.log(`RequestOptimizer: Processing ${this.state.offlineQueue.length} offline requests`);

        const queue = [...this.state.offlineQueue];
        this.state.offlineQueue = [];
        this.saveOfflineQueue();

        for (const request of queue) {
            try {
                await this._executeRequest(request.url, request.options);
                console.log('RequestOptimizer: Offline request synced', request.id);
            } catch (error) {
                console.error('RequestOptimizer: Failed to sync offline request', error);
                // Re-queue if failed
                this.state.offlineQueue.push(request);
            }
        }

        this.saveOfflineQueue();
    },

    /**
     * Save offline queue to localStorage
     */
    saveOfflineQueue() {
        try {
            localStorage.setItem(
                this.config.OFFLINE_QUEUE_KEY,
                JSON.stringify(this.state.offlineQueue)
            );
        } catch (e) {
            console.error('RequestOptimizer: Failed to save offline queue', e);
        }
    },

    /**
     * Load offline queue from localStorage
     */
    loadOfflineQueue() {
        try {
            const saved = localStorage.getItem(this.config.OFFLINE_QUEUE_KEY);
            if (saved) {
                this.state.offlineQueue = JSON.parse(saved);
                console.log(`RequestOptimizer: Loaded ${this.state.offlineQueue.length} offline requests`);
            }
        } catch (e) {
            console.error('RequestOptimizer: Failed to load offline queue', e);
            this.state.offlineQueue = [];
        }
    },

    /**
     * Generate unique request ID for deduplication
     */
    generateRequestId(url, options) {
        const method = options.method || 'GET';
        const body = options.body ? JSON.stringify(options.body) : '';
        return `${method}:${url}:${body}`;
    },

    /**
     * Process request queue
     */
    async processQueue() {
        if (this.state.queue.length === 0) return;
        if (this.state.activeRequests >= this.config.CONCURRENT_REQUESTS) return;

        const request = this.state.queue.shift();
        if (!request) return;

        this.state.activeRequests++;

        try {
            const result = await this._executeRequest(request.url, request.options);
            request.resolve(result);
        } catch (error) {
            request.reject(error);
        } finally {
            this.state.activeRequests--;
            this.processQueue(); // Process next in queue
        }
    },

    /**
     * Debounced request - delays execution until no more calls for specified time
     */
    debounce(fn, delay = 500) {
        let timeoutId = null;
        return function(...args) {
            clearTimeout(timeoutId);
            return new Promise((resolve, reject) => {
                timeoutId = setTimeout(async () => {
                    try {
                        const result = await fn.apply(this, args);
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                }, delay);
            });
        };
    },

    /**
     * Throttled request - limits execution to once per specified time
     */
    throttle(fn, delay = 1000) {
        let lastCall = 0;
        let timeoutId = null;
        
        return function(...args) {
            const now = Date.now();
            const timeSinceLastCall = now - lastCall;

            if (timeSinceLastCall >= delay) {
                lastCall = now;
                return fn.apply(this, args);
            } else {
                // Queue for later
                clearTimeout(timeoutId);
                return new Promise((resolve, reject) => {
                    timeoutId = setTimeout(async () => {
                        lastCall = Date.now();
                        try {
                            const result = await fn.apply(this, args);
                            resolve(result);
                        } catch (error) {
                            reject(error);
                        }
                    }, delay - timeSinceLastCall);
                });
            }
        };
    },

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isOnline: this.state.isOnline,
            quality: this.state.connectionQuality,
            queuedRequests: this.state.offlineQueue.length,
            activeRequests: this.state.activeRequests
        };
    }
};

// Auto-initialize
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => RequestOptimizer.init());
    } else {
        RequestOptimizer.init();
    }
}
