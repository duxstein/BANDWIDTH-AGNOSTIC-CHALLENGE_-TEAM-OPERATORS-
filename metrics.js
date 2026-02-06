// metrics.js - DataLite Advanced Analytics
// Uses PerformanceObserver, Resource Timing API, and background stats

(function() {
    'use strict';

    console.log("%c[DataLite] 📊 Metrics Module Loaded", "background: #1a1a2e; color: #00e676; font-size: 14px; padding: 4px 8px;");

    const REPORT_DELAY = 2000;
    let paintMetrics = { FP: null, FCP: null, LCP: null };
    let longTasks = [];

    // ============================================
    // PERFORMANCE OBSERVERS
    // ============================================
    
    // Paint timing observer
    try {
        const paintObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.name === 'first-paint') {
                    paintMetrics.FP = entry.startTime;
                }
                if (entry.name === 'first-contentful-paint') {
                    paintMetrics.FCP = entry.startTime;
                }
            }
        });
        paintObserver.observe({ entryTypes: ['paint'] });
    } catch (e) {
        console.warn("[DataLite] Paint observer not supported");
    }

    // LCP observer
    try {
        const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            if (entries.length > 0) {
                paintMetrics.LCP = entries[entries.length - 1].startTime;
            }
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
        console.warn("[DataLite] LCP observer not supported");
    }

    // Long task observer (for TTI approximation)
    try {
        const longTaskObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                longTasks.push({
                    start: entry.startTime,
                    duration: entry.duration
                });
            }
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (e) {
        console.warn("[DataLite] Long task observer not supported");
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
        if (document.readyState === 'complete') {
            setTimeout(generateReport, REPORT_DELAY);
        } else {
            window.addEventListener('load', () => {
                setTimeout(generateReport, REPORT_DELAY);
            });
        }
    }

    // ============================================
    // MAIN REPORT GENERATOR
    // ============================================
    async function generateReport() {
        try {
            // 1. Network Info
            const conn = navigator.connection || {};
            const networkType = conn.effectiveType?.toUpperCase() || 'UNKNOWN';
            
            // 2. Resource Timing - REAL bandwidth data
            const resources = performance.getEntriesByType('resource');
            let totalTransferred = 0;
            let totalDecoded = 0;
            let cacheHits = 0;
            let resourceCount = 0;

            resources.forEach(r => {
                resourceCount++;
                if (r.transferSize === 0 && r.decodedBodySize > 0) {
                    cacheHits++;
                }
                totalTransferred += r.transferSize || 0;
                totalDecoded += r.decodedBodySize || 0;
            });

            // 3. Navigation timing
            const navEntry = performance.getEntriesByType('navigation')[0] || {};
            const loadTime = navEntry.loadEventEnd ? 
                (navEntry.loadEventEnd - navEntry.startTime) / 1000 : null;
            const domContentLoaded = navEntry.domContentLoadedEventEnd ?
                (navEntry.domContentLoadedEventEnd - navEntry.startTime) / 1000 : null;

            // 4. Get bandwidth stats from background
            let bgStats = { blockedRequests: 0, blockedBytes: 0, allowedRequests: 0, allowedBytes: 0 };
            try {
                bgStats = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: "GET_BANDWIDTH_STATS" }, (response) => {
                        resolve(response || bgStats);
                    });
                    setTimeout(() => resolve(bgStats), 500);
                });
            } catch (e) {
                console.warn("[DataLite] Failed to get background stats");
            }

            // 5. DOM blocked count from purifier
            const domBlocked = window.__dataLiteBlockedCount || 0;

            // 6. Calculate savings
            const originalEstimate = totalTransferred + bgStats.blockedBytes;
            const savedBytes = bgStats.blockedBytes;
            const savedPercent = originalEstimate > 0 
                ? ((savedBytes / originalEstimate) * 100).toFixed(1)
                : 0;

            // 7. Get lifetime stats
            let lifetimeStats = { blockedRequests: 0, blockedBytes: 0, sessionCount: 0 };
            try {
                lifetimeStats = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: "GET_LIFETIME_STATS" }, (response) => {
                        resolve(response || lifetimeStats);
                    });
                    setTimeout(() => resolve(lifetimeStats), 500);
                });
            } catch (e) {}

            // 8. Calculate TTI approximation
            const tti = approximateTTI(paintMetrics.FCP, longTasks);

            // 9. Build report data
            const reportData = {
                '🌐 Network': networkType,
                '🚫 Blocked Requests': bgStats.blockedRequests + domBlocked,
                '✅ Allowed Requests': resourceCount,
                '📊 Original (Est.)': formatBytes(originalEstimate),
                '📦 Lite Mode': formatBytes(totalTransferred),
                '💚 Saved': `${savedPercent}%`,
                '⚡ First Paint': paintMetrics.FP ? `${(paintMetrics.FP / 1000).toFixed(2)}s` : 'N/A',
                '🎨 FCP': paintMetrics.FCP ? `${(paintMetrics.FCP / 1000).toFixed(2)}s` : 'N/A',
                '🖼️ LCP': paintMetrics.LCP ? `${(paintMetrics.LCP / 1000).toFixed(2)}s` : 'N/A',
                '🎯 TTI (Est.)': tti ? `${(tti / 1000).toFixed(2)}s` : 'N/A',
                '⏱️ Load Time': loadTime ? `${loadTime.toFixed(2)}s` : 'N/A',
                '💾 Cache Hits': cacheHits
            };

            // 10. Print beautiful console report
            printConsoleReport(reportData, parseFloat(savedPercent), lifetimeStats);

            // 11. Update lifetime stats
            chrome.runtime.sendMessage({
                action: "UPDATE_LIFETIME_STATS",
                blockedRequests: bgStats.blockedRequests + domBlocked,
                blockedBytes: bgStats.blockedBytes
            });

        } catch (err) {
            console.error("[DataLite] Error generating report:", err);
        }
    }

    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function approximateTTI(fcp, longTasks) {
        if (!fcp) return null;
        
        // Find 5 second quiet window after FCP
        const quietWindowMs = 5000;
        let lastLongTaskEnd = fcp;
        
        for (const task of longTasks) {
            if (task.start + task.duration > lastLongTaskEnd) {
                lastLongTaskEnd = task.start + task.duration;
            }
        }
        
        return lastLongTaskEnd + quietWindowMs;
    }

    function printConsoleReport(data, savedPercent, lifetime) {
        const isGoodSavings = savedPercent >= 80;
        const isMediumSavings = savedPercent >= 50;
        
        // Header
        console.log('\n');
        console.log('%c ╔════════════════════════════════════════════════════════╗ ', 
            'background: #1a1a2e; color: #00e676; font-weight: bold;');
        console.log('%c ║            📊 DataLite Analytics Report                ║ ', 
            'background: #1a1a2e; color: #00e676; font-weight: bold;');
        console.log('%c ╠════════════════════════════════════════════════════════╣ ', 
            'background: #1a1a2e; color: #444;');

        // Main table
        console.table(data);

        // Savings highlight
        const savingsColor = isGoodSavings ? '#00e676' : isMediumSavings ? '#ffc107' : '#ff5722';
        console.log(
            `%c 💰 Data Savings: ${savedPercent}% %c ${isGoodSavings ? '✓ EXCELLENT' : isMediumSavings ? '○ GOOD' : '✗ LOW'}`,
            `background: ${savingsColor}; color: #000; font-weight: bold; padding: 4px 8px; font-size: 14px;`,
            `color: ${savingsColor}; font-weight: bold;`
        );

        // Lifetime stats
        console.log('%c ╠════════════════════════════════════════════════════════╣ ', 
            'background: #1a1a2e; color: #444;');
        console.log('%c ║                  📈 Lifetime Statistics                 ║ ', 
            'background: #1a1a2e; color: #29b6f6; font-weight: bold;');
        
        console.log(`%c   Total Requests Blocked: %c${lifetime.blockedRequests.toLocaleString()}`,
            'color: #888;', 'color: #fff; font-weight: bold;');
        console.log(`%c   Total Data Saved:       %c${formatBytes(lifetime.blockedBytes)}`,
            'color: #888;', 'color: #00e676; font-weight: bold;');
        console.log(`%c   Sessions:               %c${lifetime.sessionCount}`,
            'color: #888;', 'color: #fff;');

        console.log('%c ╚════════════════════════════════════════════════════════╝ ', 
            'background: #1a1a2e; color: #00e676; font-weight: bold;');
        console.log('\n');
    }

    // ============================================
    // EXPORTS
    // ============================================
    init();
    window.printDataLiteMetrics = generateReport;

})();
