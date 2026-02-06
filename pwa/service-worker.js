// service-worker.js - DataLite PWA Service Worker
// Implements cache-first strategy, offline support, and content compression

const CACHE_NAME = 'datalite-pwa-v1';
const OFFLINE_URL = '/offline.html';

// App Shell files to precache
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.webmanifest'
];

// Resource types to cache
const CACHEABLE_TYPES = ['document', 'script', 'style', 'font'];

// Resources to block (never fetch)
const BLOCKED_PATTERNS = [
    /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i,
    /\.(mp4|webm|avi|mov|wmv)$/i,
    /\.(mp3|wav|ogg|flac)$/i,
    /\.(woff|woff2|ttf|otf|eot)$/i,
    /analytics|tracker|adservice|doubleclick/i,
    /facebook\.com|twitter\.com|linkedin\.com/i,
    /googletagmanager|hotjar|mixpanel/i
];

// ================================
// INSTALL EVENT
// ================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing DataLite Service Worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Precaching app shell...');
            return cache.addAll(PRECACHE_ASSETS);
        }).then(() => {
            self.skipWaiting();
        })
    );
});

// ================================
// ACTIVATE EVENT
// ================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            self.clients.claim();
        })
    );
});

// ================================
// FETCH EVENT
// ================================
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') return;
    
    // Skip chrome-extension URLs
    if (url.protocol === 'chrome-extension:') return;
    
    // Block heavy resources
    if (shouldBlock(url.href)) {
        console.log('[SW] Blocked:', url.pathname);
        event.respondWith(new Response('', { status: 204 }));
        logBlocked(url.href);
        return;
    }
    
    // Cache-first strategy
    event.respondWith(cacheFirst(request));
});

// ================================
// CACHE STRATEGIES
// ================================

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        console.log('[SW] Cache hit:', request.url);
        logCacheHit();
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        
        // Only cache successful responses
        if (networkResponse.ok) {
            const responseToCache = await processResponse(networkResponse.clone());
            cache.put(request, responseToCache);
        }
        
        return networkResponse;
        
    } catch (error) {
        console.log('[SW] Network failed, serving offline page');
        logOfflineLoad();
        
        // Return cached index.html for navigation requests
        if (request.mode === 'navigate') {
            return cache.match('/index.html');
        }
        
        return new Response('Offline', { status: 503 });
    }
}

// ================================
// RESPONSE PROCESSING
// ================================

async function processResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    
    // Only process HTML
    if (!contentType.includes('text/html')) {
        return response;
    }
    
    try {
        let html = await response.text();
        const originalSize = html.length;
        
        // Minify HTML
        html = minifyHTML(html);
        
        const newSize = html.length;
        const saved = originalSize - newSize;
        
        console.log(`[SW] Compressed HTML: ${originalSize} → ${newSize} (${saved} bytes saved)`);
        logSizeSaved(saved);
        
        return new Response(html, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });
        
    } catch (e) {
        return response;
    }
}

function minifyHTML(html) {
    return html
        // Remove HTML comments
        .replace(/<!--[\s\S]*?-->/g, '')
        // Remove script tags (except inline critical ones)
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        // Remove style tags
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        // Remove link stylesheet tags
        .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '')
        // Collapse whitespace
        .replace(/\s{2,}/g, ' ')
        // Remove whitespace around tags
        .replace(/>\s+</g, '><')
        .trim();
}

// ================================
// BLOCKING LOGIC
// ================================

function shouldBlock(url) {
    return BLOCKED_PATTERNS.some(pattern => pattern.test(url));
}

// ================================
// METRICS (via postMessage)
// ================================

let metrics = {
    cacheHits: 0,
    blockedRequests: 0,
    offlineLoads: 0,
    bytesSaved: 0
};

function logCacheHit() {
    metrics.cacheHits++;
    broadcastMetrics();
}

function logBlocked(url) {
    metrics.blockedRequests++;
    broadcastMetrics();
}

function logOfflineLoad() {
    metrics.offlineLoads++;
    broadcastMetrics();
}

function logSizeSaved(bytes) {
    metrics.bytesSaved += bytes;
    broadcastMetrics();
}

function broadcastMetrics() {
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'DATALITE_SW_METRICS',
                metrics: { ...metrics }
            });
        });
    });
}

// ================================
// MESSAGE HANDLING
// ================================

self.addEventListener('message', (event) => {
    if (event.data.type === 'GET_METRICS') {
        event.source.postMessage({
            type: 'DATALITE_SW_METRICS',
            metrics: { ...metrics }
        });
    }
    
    if (event.data.type === 'CACHE_CONTENT') {
        // Extension sends cleaned content to cache
        caches.open(CACHE_NAME).then(cache => {
            const response = new Response(event.data.html, {
                headers: { 'Content-Type': 'text/html' }
            });
            cache.put(event.data.url, response);
            console.log('[SW] Cached cleaned content:', event.data.url);
        });
    }
    
    if (event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            console.log('[SW] Cache cleared');
            metrics = { cacheHits: 0, blockedRequests: 0, offlineLoads: 0, bytesSaved: 0 };
        });
    }
});

console.log('[SW] DataLite Service Worker loaded');
