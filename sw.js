// Service Worker for Ambulance Log PWA
// نظام سجل الإسعاف - دعم العمل بدون إنترنت
const CACHE_NAME = 'ambulance-log-v9';
const OFFLINE_QUEUE_KEY = 'offline_queue';

const urlsToCache = [
  './',
  './login.html',
  './driver-interface.html',
  './nurse-interface.html',
  './admin-interface.html',
  './settings-interface.html',
  './moh-logo.png',
  './manifest.json'
];

// Install event - Skip waiting to activate immediately
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
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

// Sync offline requests when back online
self.addEventListener('sync', event => {
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(syncOfflineData());
  }
});

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

// Activate event - Take control immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => caches.delete(cacheName))
        );
      })
    ])
  );
});

// Listen for messages from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SYNC_NOW') {
    syncOfflineData();
  }
});
