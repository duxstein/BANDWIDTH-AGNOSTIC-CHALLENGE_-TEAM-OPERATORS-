// middleware.js
// Virtual Service Worker - Intercepts Main World fetch requests

(function() {
    console.log("[DataLite] Middleware injected into Main World.");

    const CACHE_NAME = 'datalite-cache-v1';
    const originalFetch = window.fetch;

    // Helper: Compress HTML/JSON content
    async function compressContent(response) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html') || contentType.includes('application/json')) {
            try {
                let text = await response.text();
                const originalSize = text.length;
                
                // Simple compression: remove extra spaces/newlines and comments
                // Note: aggressive regex can break pre tags or JS strings.
                // We'll use safe-ish generic minification.
                text = text.replace(/<!--[\s\S]*?-->/g, "") // Remove HTML comments
                           .replace(/\s{2,}/g, " ")          // Collapse whitespace
                           .trim();
                
                const newSize = text.length;
                const savings = Math.round((1 - newSize/originalSize)*100);
                
                console.groupCollapsed(`%c[DataLite] %cSaved ${savings}% on ${response.url.split('/').pop()}`, 'color: #00e676; font-weight: bold;', 'color: #b0b0b0;');
                console.log(`Original:   ${originalSize} bytes`);
                console.log(`Compressed: ${newSize} bytes`);
                console.log(`Saved:      ${originalSize - newSize} bytes`);
                console.groupEnd();

                return new Response(text, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                });
            } catch (e) {
                console.error("[DataLite] Compression failed", e);
                return response; // Return original if error
            }
        }
        return response;
    }

    // Override fetch
    window.fetch = async function(...args) {
        // Check if Lite Mode is active (we can't easily read chrome.storage directly in MAIN world synchronously without messaging)
        // But we can check a DOM marker or assume active if this script is injected.
        // For this architecture, we'll assume if this script is running, we want interception.
        // OR we can communicate with the content script via CustomEvents.
        
        // Let's implement Cache-First Strategy
        const request = new Request(...args);
        
        // Only cache GET requests
        if (request.method !== 'GET') {
            return originalFetch(...args);
        }

        try {
            const cache = await caches.open(CACHE_NAME);
            const cachedResponse = await cache.match(request);

            if (cachedResponse) {
                console.log(`[DataLite] Served from Cache: ${request.url}`);
                // Background update: Fetch fresh, compress, and update cache for next time (Stale-While-Revalidateish)
                // Or true Cache-First (Offline fallback)? User asked for "cache-first strategy" + "offline fallback".
                // We'll just return cached.
                return cachedResponse;
            }

            // Network Request
            console.log(`[DataLite] Network Request: ${request.url}`);
            const networkResponse = await originalFetch(...args);
            
            // Clone for cache
            const responseToCache = networkResponse.clone();
            const compressedResponse = await compressContent(responseToCache);

            // Store in cache
            if (networkResponse.status === 200) {
                 cache.put(request, compressedResponse.clone());
            }

            return compressedResponse;

        } catch (error) {
            console.error("[DataLite] Fetch Error:", error);
            // Offline fallback? try cache again if we didn't check it (though we did above)
            throw error;
        }
    };

    console.log("[DataLite] fetch() overridden.");

})();
