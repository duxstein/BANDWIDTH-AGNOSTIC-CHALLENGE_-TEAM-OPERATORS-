// background.js - DataLite Service Worker
// Handles DNR rules, bandwidth tracking, and metrics aggregation

// ============================================
// STATE MANAGEMENT
// ============================================
const tabStats = new Map(); // Per-tab bandwidth stats

function getTabStats(tabId) {
    if (!tabStats.has(tabId)) {
        tabStats.set(tabId, {
            blockedRequests: 0,
            blockedBytes: 0,
            allowedRequests: 0,
            allowedBytes: 0,
            startTime: Date.now()
        });
    }
    return tabStats.get(tabId);
}

// ============================================
// DNR RULE MANAGEMENT
// ============================================
function updateBlockingRules(enabled) {
    const ruleSetId = "lite_mode_blocking";
    if (enabled) {
        chrome.declarativeNetRequest.updateEnabledRulesets({
            enableRulesetIds: [ruleSetId]
        }, () => {
            if (chrome.runtime.lastError) {
                console.error("[DataLite] Error enabling rules:", chrome.runtime.lastError);
            } else {
                console.log("[DataLite] Lite Mode Rules ENABLED - Blocking active");
            }
        });
    } else {
        chrome.declarativeNetRequest.updateEnabledRulesets({
            disableRulesetIds: [ruleSetId]
        }, () => {
            if (chrome.runtime.lastError) {
                console.error("[DataLite] Error disabling rules:", chrome.runtime.lastError);
            } else {
                console.log("[DataLite] Lite Mode Rules DISABLED");
            }
        });
    }
}

// ============================================
// WEBREQUEST BANDWIDTH TRACKING
// ============================================

// Track completed requests (allowed through)
chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (details.tabId < 0) return; // Ignore non-tab requests
        
        const stats = getTabStats(details.tabId);
        const contentLength = details.responseHeaders?.find(
            h => h.name.toLowerCase() === 'content-length'
        );
        const bytes = contentLength ? parseInt(contentLength.value, 10) : 0;
        
        stats.allowedRequests++;
        stats.allowedBytes += bytes;
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
);

// Track blocked requests via DNR callback
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener((info) => {
    if (info.request.tabId < 0) return;
    
    const stats = getTabStats(info.request.tabId);
    stats.blockedRequests++;
    
    // Estimate blocked bytes based on resource type
    const estimatedBytes = getEstimatedBytes(info.request.type);
    stats.blockedBytes += estimatedBytes;
});

function getEstimatedBytes(resourceType) {
    const estimates = {
        'image': 150 * 1024,      // 150KB avg
        'font': 50 * 1024,        // 50KB avg
        'stylesheet': 30 * 1024,  // 30KB avg
        'script': 100 * 1024,     // 100KB avg
        'media': 500 * 1024,      // 500KB avg
        'sub_frame': 200 * 1024,  // 200KB avg
        'other': 20 * 1024        // 20KB default
    };
    return estimates[resourceType] || estimates.other;
}

// Reset stats on navigation
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) { // Main frame only
        tabStats.delete(details.tabId);
    }
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
    tabStats.delete(tabId);
});

// ============================================
// LIFETIME STATS MANAGEMENT
// ============================================
async function updateLifetimeStats(blockedRequests, blockedBytes) {
    const result = await chrome.storage.local.get([
        'lifetimeBlockedRequests',
        'lifetimeBlockedBytes',
        'sessionCount'
    ]);
    
    await chrome.storage.local.set({
        lifetimeBlockedRequests: (result.lifetimeBlockedRequests || 0) + blockedRequests,
        lifetimeBlockedBytes: (result.lifetimeBlockedBytes || 0) + blockedBytes,
        sessionCount: (result.sessionCount || 0) + 1,
        lastUpdated: Date.now()
    });
}

// ============================================
// MESSAGE HANDLERS
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_BANDWIDTH_STATS") {
        const tabId = sender.tab?.id || request.tabId;
        if (!tabId) {
            sendResponse({ error: "No tab ID" });
            return true;
        }
        
        const stats = getTabStats(tabId);
        sendResponse({
            blockedRequests: stats.blockedRequests,
            blockedBytes: stats.blockedBytes,
            allowedRequests: stats.allowedRequests,
            allowedBytes: stats.allowedBytes,
            duration: Date.now() - stats.startTime
        });
        return true;
    }
    
    if (request.action === "GET_LIFETIME_STATS") {
        chrome.storage.local.get([
            'lifetimeBlockedRequests',
            'lifetimeBlockedBytes',
            'sessionCount',
            'totalBlockedItems'
        ], (result) => {
            sendResponse({
                blockedRequests: result.lifetimeBlockedRequests || 0,
                blockedBytes: result.lifetimeBlockedBytes || 0,
                sessionCount: result.sessionCount || 0,
                domBlocked: result.totalBlockedItems || 0
            });
        });
        return true;
    }
    
    if (request.action === "UPDATE_LIFETIME_STATS") {
        updateLifetimeStats(
            request.blockedRequests || 0,
            request.blockedBytes || 0
        );
        sendResponse({ success: true });
        return true;
    }

    if (request.type === 'GET_STATUS') {
        chrome.storage.local.get(['liteModeEnabled'], (result) => {
            sendResponse({ liteModeEnabled: result.liteModeEnabled });
        });
        return true;
    }
});

// ============================================
// INITIALIZATION
// ============================================
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['liteModeEnabled'], (result) => {
        const enabled = result.liteModeEnabled || false;
        if (result.liteModeEnabled === undefined) {
            chrome.storage.local.set({ liteModeEnabled: false });
        }
        updateBlockingRules(enabled);
        console.log(`[DataLite] Installed. Lite Mode: ${enabled ? 'ON' : 'OFF'}`);
    });
});

// Listen for storage changes to toggle rules
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.liteModeEnabled) {
        updateBlockingRules(changes.liteModeEnabled.newValue);
    }
});

console.log("[DataLite] Background Service Worker loaded");
