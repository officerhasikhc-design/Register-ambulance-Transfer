/**
 * DataCache - نظام التخزين المؤقت الذكي
 * Smart caching system for instant data loading
 * 
 * Strategy: Stale-While-Revalidate
 * 1. Show cached data instantly on page load (0ms delay)
 * 2. Fetch fresh data from server in background
 * 3. Update UI only if data has changed
 */

const DataCache = {
    // In-flight request deduplication
    _inflight: {},

    // Cache keys
    KEYS: {
        PENDING_TRIPS: 'cache_pending_trips',
        RECORDS: 'cache_records',
        STATS: 'cache_stats',
        VEHICLES: 'cache_vehicles',
        NOTIFICATIONS: 'cache_notifications',
        TIMESTAMPS: 'cache_timestamps',
        ADMIN_DATA: 'cache_admin_data'
    },

    // Cache expiry times (milliseconds)
    EXPIRY: {
        PENDING_TRIPS: 5 * 60 * 1000,   // 5 minutes
        RECORDS: 10 * 60 * 1000,          // 10 minutes
        STATS: 5 * 60 * 1000,             // 5 minutes
        VEHICLES: 30 * 60 * 1000,         // 30 minutes
        NOTIFICATIONS: 5 * 60 * 1000,     // 5 minutes
        ADMIN_DATA: 5 * 60 * 1000         // 5 minutes
    },

    /**
     * Save data to localStorage cache with timestamp
     */
    set(key, data) {
        try {
            const entry = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(key, JSON.stringify(entry));
        } catch (e) {
            console.warn('DataCache: Storage full, clearing old cache');
            this.clearAll();
            try {
                localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
            } catch (e2) {
                console.error('DataCache: Cannot save to storage');
            }
        }
    },

    /**
     * Get cached data if available and not expired
     * Returns { data, isExpired, timestamp } or null
     */
    get(key, expiryMs) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;

            const entry = JSON.parse(raw);
            if (!entry || !entry.data) return null;

            const age = Date.now() - (entry.timestamp || 0);
            return {
                data: entry.data,
                isExpired: age > (expiryMs || 300000),
                age: age,
                timestamp: entry.timestamp
            };
        } catch (e) {
            return null;
        }
    },

    /**
     * Remove a specific cache entry
     */
    remove(key) {
        localStorage.removeItem(key);
    },

    /**
     * Clear all cache entries
     */
    clearAll() {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('cache_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    },

    /**
     * Generate a simple hash for data comparison
     */
    hash(data) {
        return JSON.stringify(data).length + '_' + JSON.stringify(data).split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
    },

    /**
     * Fetch with cache - Core method
     * Shows cached data instantly, fetches fresh data in background
     * 
     * @param {string} url - Fetch URL
     * @param {string} cacheKey - Cache storage key
     * @param {number} expiryMs - Cache expiry in ms
     * @param {function} onData - Callback when data is available (called 1-2 times)
     * @param {function} extractData - Function to extract data from response
     * @returns {Promise} - Resolves when background fetch completes
     */
    async fetchWithCache(url, cacheKey, expiryMs, onData, extractData) {
        // Step 1: Instantly show cached data
        const cached = this.get(cacheKey, expiryMs);
        let cachedHash = null;

        if (cached && cached.data) {
            cachedHash = this.hash(cached.data);
            onData(cached.data, { fromCache: true, isExpired: cached.isExpired });
        }

        // Step 2: Fetch fresh data in background (with request deduplication)
        try {
            if (!this._inflight[url]) {
                this._inflight[url] = fetch(url).then(r => r.json());
            }
            const result = await this._inflight[url];
            delete this._inflight[url];
            const freshData = extractData ? extractData(result) : result;

            if (freshData !== null && freshData !== undefined) {
                const freshHash = this.hash(freshData);

                // Only update UI if data actually changed
                if (freshHash !== cachedHash) {
                    this.set(cacheKey, freshData);
                    onData(freshData, { fromCache: false, isExpired: false });
                } else {
                    // Data unchanged, just update timestamp
                    this.set(cacheKey, freshData);
                }
            }
        } catch (error) {
            delete this._inflight[url];
            // If no cached data was shown, report the error
            if (!cached || !cached.data) {
                console.error('DataCache: Fetch failed and no cache available', error);
                onData(null, { fromCache: false, isExpired: true, error: error });
            }
        }
    },

    /**
     * Preload all data for a specific page type
     * Call this as early as possible (before DOM ready)
     */
    _preloadFetch(url, cacheKey, extractData) {
        if (!this._inflight[url]) {
            this._inflight[url] = fetch(url).then(r => r.json());
        }
        return this._inflight[url].then(result => {
            const data = extractData(result);
            if (data) this.set(cacheKey, data);
        }).catch(() => {});
    },

    preload(webAppUrl, pageType) {
        const fetches = [];

        if (pageType === 'driver' || pageType === 'nurse') {
            fetches.push(this._preloadFetch(
                `${webAppUrl}?action=getPendingTrips`,
                this.KEYS.PENDING_TRIPS,
                r => (r.success && r.trips) ? r.trips : null
            ));
        }

        if (pageType === 'nurse') {
            fetches.push(this._preloadFetch(
                `${webAppUrl}?action=getRecords`,
                this.KEYS.RECORDS,
                r => (r.success && r.records) ? r.records : null
            ));
        }

        if (pageType === 'admin') {
            const now = new Date();
            const year = now.getFullYear().toString();
            const month = String(now.getMonth() + 1);
            const url = `${webAppUrl}?action=getAdminData&year=${year}&month=${month}`;
            fetches.push(this._preloadFetch(
                url,
                this.KEYS.ADMIN_DATA,
                r => r.success ? r : null
            ));
        }

        if (pageType === 'nurse') {
            fetches.push(this._preloadFetch(
                `${webAppUrl}?action=getVehicles`,
                this.KEYS.VEHICLES,
                r => (r.success && r.vehicles) ? r.vehicles : null
            ));
        }

        return Promise.allSettled(fetches);
    },

    /**
     * Invalidate cache after a write operation (submit, update, delete)
     * Forces next load to fetch fresh data
     */
    invalidate(...keys) {
        keys.forEach(key => this.remove(key));
    },

    /**
     * Invalidate all data caches (after submit/update)
     */
    invalidateAll() {
        this.clearAll();
    }
};
