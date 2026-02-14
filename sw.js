// Service Worker for Ambulance Log PWA
// نظام سجل الإسعاف - دعم العمل بدون إنترنت
const CACHE_NAME = 'ambulance-log-v21-button-fix';
const OFFLINE_QUEUE_KEY = 'offline_queue';

const urlsToCache = [
  './',
  './login.html',
  './driver-interface.html',
  './nurse-interface.html',
  './admin-interface.html',
  './settings-interface.html',
  './moh-logo.png',
  './manifest.json',
  // New optimization files
  './request-optimizer.js',
  './ui-optimizer.js',
  './connection-monitor.js',
  './data-cache.js',
  './session-manager.js'
];

// Install event - Skip waiting to activate immediately
self.addEventListener('install', event => {
  console.log('[SW] Installing Service Worker v21-button-fix...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell...');
        // Cache files one by one to avoid failures
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(err => {
              console.warn(`[SW] Failed to cache ${url}:`, err);
              return null;
            })
          )
        );
      })
      .then(() => console.log('[SW] Installation complete'))
      .catch(err => console.error('[SW] Installation failed:', err))
  );
});

// Fetch event - Network First with Offline Queue for POST requests
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Handle POST requests (data submissions)
  if (event.request.method === 'POST') {
    event.respondWith(handlePostRequest(event.request.clone()));
    return;
  }
  
  // Handle GET requests - Network First
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Handle POST requests with offline support
async function handlePostRequest(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    // Network failed - queue the request for later
    const requestData = await request.text();
    await queueOfflineRequest(request.url, requestData);
    
    // Return a fake success response
    return new Response(JSON.stringify({
      success: true,
      offline: true,
      message: 'تم حفظ البيانات محلياً وسيتم إرسالها عند توفر الإنترنت'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Queue offline request in IndexedDB
async function queueOfflineRequest(url, data) {
  const db = await openOfflineDB();
  const tx = db.transaction('requests', 'readwrite');
  const store = tx.objectStore('requests');
  
  await store.add({
    url: url,
    data: data,
    timestamp: Date.now()
  });
}

// Open IndexedDB for offline queue
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('AmbulanceOfflineDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('requests')) {
        db.createObjectStore('requests', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// Background Sync disabled - using manual sync instead
// Note: Background Sync API may not be available in all browsers
// We handle offline sync manually via connection monitoring

// Process queued offline requests
async function syncOfflineData() {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('requests', 'readwrite');
    const store = tx.objectStore('requests');
    const requests = await getAllFromStore(store);
    
    for (const req of requests) {
      try {
        await fetch(req.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: req.data
        });
        
        // Delete successful request
        const deleteTx = db.transaction('requests', 'readwrite');
        await deleteTx.objectStore('requests').delete(req.id);
        
        // Notify clients
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'SYNC_SUCCESS',
              message: 'تم مزامنة البيانات بنجاح'
            });
          });
        });
      } catch (error) {
        console.log('Sync failed for request:', req.id);
      }
    }
  } catch (error) {
    console.error('Sync error:', error);
  }
}

// Helper to get all from IndexedDB store
function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Activate event - Take control immediately and clean old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating Service Worker v21-button-fix...');
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(cacheNames => {
        const oldCaches = cacheNames.filter(cacheName => cacheName !== CACHE_NAME);
        if (oldCaches.length > 0) {
          console.log('[SW] Deleting old caches:', oldCaches);
        }
        return Promise.all(
          oldCaches.map(cacheName => caches.delete(cacheName))
        );
      })
    ])
    .then(() => {
      console.log('[SW] Activation complete - App updated!');
      // Notify all clients about the update
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            message: 'تم تحديث التطبيق بنجاح',
            version: CACHE_NAME
          });
        });
      });
    })
  );
});

// Listen for messages from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SYNC_NOW') {
    syncOfflineData();
  }
});
