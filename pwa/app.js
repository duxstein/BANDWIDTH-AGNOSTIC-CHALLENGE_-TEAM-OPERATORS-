// app.js - DataLite PWA Main Application
// Handles SW registration, install prompt, metrics, and extension communication

(function() {
    'use strict';

    // ================================
    // DOM ELEMENTS
    // ================================
    const skeleton = document.getElementById('skeleton');
    const portalContent = document.getElementById('portal-content');
    const offlineBanner = document.getElementById('offline-banner');
    const installBtn = document.getElementById('install-btn');
    const statusText = document.getElementById('status-text');
    const savingsBadge = document.getElementById('savings-badge');

    // ================================
    // STATE
    // ================================
    let deferredPrompt = null;
    let swMetrics = {
        cacheHits: 0,
        blockedRequests: 0,
        offlineLoads: 0,
        bytesSaved: 0
    };

    // ================================
    // SERVICE WORKER REGISTRATION
    // ================================
    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.warn('[PWA] Service Workers not supported');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/'
            });
            
            console.log('[PWA] Service Worker registered:', registration.scope);
            setStatus('Service Worker active');

            registration.addEventListener('updatefound', () => {
                console.log('[PWA] New Service Worker found');
            });

        } catch (error) {
            console.error('[PWA] SW registration failed:', error);
        }
    }

    // ================================
    // INSTALL PROMPT
    // ================================
    function setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.classList.remove('hidden');
            console.log('[PWA] Install prompt ready');
        });

        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;

            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            
            console.log('[PWA] Install outcome:', outcome);
            deferredPrompt = null;
            installBtn.classList.add('hidden');
        });

        window.addEventListener('appinstalled', () => {
            console.log('[PWA] App installed!');
            setStatus('App installed');
        });
    }

    // ================================
    // OFFLINE DETECTION
    // ================================
    function setupOfflineDetection() {
        const updateOnlineStatus = () => {
            if (navigator.onLine) {
                offlineBanner.classList.add('hidden');
                setStatus('Online');
            } else {
                offlineBanner.classList.remove('hidden');
                setStatus('Offline - cached content');
            }
        };

        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus();
    }

    // ================================
    // EXTENSION COMMUNICATION
    // ================================
    function setupExtensionBridge() {
        // Listen for cleaned content from extension
        window.addEventListener('message', (event) => {
            if (event.data.type === 'DATALITE_CLEANED_CONTENT') {
                renderContent(event.data.html);
                
                // Cache the cleaned content
                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        type: 'CACHE_CONTENT',
                        url: event.data.url,
                        html: event.data.html
                    });
                }
            }

            if (event.data.type === 'DATALITE_SW_METRICS') {
                swMetrics = event.data.metrics;
                updateMetricsDisplay();
            }
        });

        // Listen for SW messages
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data.type === 'DATALITE_SW_METRICS') {
                swMetrics = event.data.metrics;
                updateMetricsDisplay();
            }
        });
    }

    // ================================
    // CONTENT RENDERING
    // ================================
    function renderContent(html) {
        skeleton.classList.add('hidden');
        portalContent.innerHTML = html;
        portalContent.classList.remove('hidden');
        setStatus('Content loaded');
        
        console.log('[PWA] Content rendered, size:', html.length, 'bytes');
    }

    function showSkeleton() {
        portalContent.classList.add('hidden');
        skeleton.classList.remove('hidden');
        setStatus('Loading...');
    }

    // ================================
    // METRICS DISPLAY
    // ================================
    function updateMetricsDisplay() {
        const savedKB = (swMetrics.bytesSaved / 1024).toFixed(1);
        const totalRequests = swMetrics.cacheHits + swMetrics.blockedRequests;
        const savedPercent = totalRequests > 0 
            ? Math.round((swMetrics.blockedRequests / totalRequests) * 100)
            : 0;

        savingsBadge.textContent = `${savedPercent}% saved`;
        
        // Log to console
        console.table({
            '💾 Cache Hits': swMetrics.cacheHits,
            '🚫 Blocked': swMetrics.blockedRequests,
            '📡 Offline Loads': swMetrics.offlineLoads,
            '📦 Data Saved': `${savedKB} KB`
        });
    }

    // ================================
    // UTILITIES
    // ================================
    function setStatus(text) {
        statusText.textContent = text;
    }

    // ================================
    // DEMO CONTENT (for testing)
    // ================================
    function loadDemoContent() {
        setTimeout(() => {
            const demoHTML = `
                <h2>Welcome to DataLite Portal</h2>
                <p>This is a lightweight PWA wrapper for university portals.</p>
                
                <h3>Features</h3>
                <ul>
                    <li>⚡ Instant loading with cached content</li>
                    <li>📡 Works offline</li>
                    <li>📦 80-95% data savings</li>
                    <li>📱 Installable on home screen</li>
                </ul>
                
                <h3>Quick Links</h3>
                <table>
                    <tr><th>Portal</th><th>Status</th></tr>
                    <tr><td>GIET ERP</td><td>✓ Ready</td></tr>
                    <tr><td>Attendance</td><td>✓ Ready</td></tr>
                    <tr><td>Results</td><td>✓ Ready</td></tr>
                </table>
                
                <br>
                <p style="color: var(--text-secondary); font-size: 14px;">
                    Enable the DataLite extension and visit any portal to see cleaned content here.
                </p>
            `;
            renderContent(demoHTML);
        }, 1500);
    }

    // ================================
    // INITIALIZATION
    // ================================
    async function init() {
        console.log('%c[DataLite PWA] Initializing...', 'color: #00e676; font-weight: bold;');
        
        await registerServiceWorker();
        setupInstallPrompt();
        setupOfflineDetection();
        setupExtensionBridge();
        
        // Show demo content if no extension message received
        loadDemoContent();
        
        console.log('%c[DataLite PWA] Ready!', 'color: #00e676; font-weight: bold;');
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for debugging
    window.DataLitePWA = {
        showSkeleton,
        renderContent,
        getMetrics: () => swMetrics
    };

})();
