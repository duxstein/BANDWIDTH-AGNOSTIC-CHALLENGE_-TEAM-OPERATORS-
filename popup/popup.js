document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('liteModeToggle');
    const statusText = document.getElementById('statusText');
    const statusIndicator = document.getElementById('statusIndicator');
    const savedDataValue = document.getElementById('savedDataValue');
    const blockedItemsValue = document.getElementById('blockedItemsValue');
    const resetBtn = document.getElementById('resetStats');

    // Load initial state
    updateState();

    // Listen for toggle changes
    toggle.addEventListener('change', () => {
        const isEnabled = toggle.checked;
        chrome.storage.local.set({ liteModeEnabled: isEnabled }, () => {
            updateUI(isEnabled);
        });
    });

    // Reset Stats
    resetBtn.addEventListener('click', () => {
        chrome.storage.local.set({ 
            totalDataSaved: 0,
            totalBlockedItems: 0
        }, () => {
            updateState(); // Refresh UI
        });
    });

    function updateState() {
        chrome.storage.local.get(['liteModeEnabled', 'totalDataSaved', 'totalBlockedItems'], (result) => {
            const isEnabled = result.liteModeEnabled || false;
            toggle.checked = isEnabled;
            updateUI(isEnabled);
            
            // Update Stats
            const savedBytes = result.totalDataSaved || 0;
            const blockedCount = result.totalBlockedItems || 0;
            
            savedDataValue.textContent = formatBytes(savedBytes);
            blockedItemsValue.textContent = formatNumber(blockedCount);
        });
    }

    function updateUI(isEnabled) {
        if (isEnabled) {
            statusText.textContent = 'Lite Mode Active';
            statusText.style.color = 'var(--primary-color)';
            statusIndicator.classList.add('active');
        } else {
            statusText.textContent = 'Lite Mode Disabled';
            statusText.style.color = 'var(--text-secondary)';
            statusIndicator.classList.remove('active');
        }
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 KB';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
});
