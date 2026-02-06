// content.js

let isLiteModeApplied = false;

function applyLiteMode(enabled) {
  if (enabled && !isLiteModeApplied) {
    // Only run cleanHTML once per page load to avoid loop/conflict
    // If user toggles OFF, we tell them to reload.
    if (typeof cleanHTML === 'function') {
        cleanHTML();
        isLiteModeApplied = true;
    } else {
        console.error("DataLite: cleanHTML function not found.");
    }
  } else if (!enabled && isLiteModeApplied) {
     // User turned off Lite Mode after it was applied. 
     // We can't easily undo the DOM nuke without reload.
     alert("DataLite: Please reload the page to restore the full version.");
  }
}

// Initial check
chrome.storage.local.get(['liteModeEnabled'], (result) => {
  if (result.liteModeEnabled) {
      // Small delay to ensure purifier.js is loaded if running at document_end
      applyLiteMode(true);
  }
});

// Listen for changes in storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.liteModeEnabled) {
    applyLiteMode(changes.liteModeEnabled.newValue);
  }
});

// Listen for metrics from Main World (middleware.js)
window.addEventListener('message', (event) => {
    // We only accept messages from ourselves
    if (event.source !== window) return;

    if (event.data.type === 'DATALITE_METRIC_DATA_SAVED') {
        const bytes = event.data.bytes || 0;
        updateMetric('totalDataSaved', bytes);
    }
});

function updateMetric(key, valueToAdd) {
    chrome.storage.local.get([key], (result) => {
        const current = result[key] || 0;
        chrome.storage.local.set({ [key]: current + valueToAdd });
    });
}
