// loader.js

(function() {
    // Check if we are in a frame or Main World if needed. 
    // Since we want to hide the white flash of the original page, we run this immediately.
    
    chrome.storage.local.get(['liteModeEnabled'], (result) => {
        if (result.liteModeEnabled) {
            injectSkeleton();
        }
    });

    function injectSkeleton() {
        // Prevent original content from flashing if possible (hide body)
        const style = document.createElement('style');
        style.id = 'datalite-initial-hide';
        style.textContent = 'body { visibility: hidden !important; }'; 
        document.documentElement.appendChild(style);

        // Wait for body to exist (it might not be there at document_start)
        const checkBody = setInterval(() => {
            if (document.body) {
                clearInterval(checkBody);
                
                // Create overlay
                const overlay = document.createElement('div');
                overlay.id = 'datalite-skeleton-loader';
                
                // Skeleton Structure
                overlay.innerHTML = `
                    <div class="skeleton-header">
                        <div class="skeleton-logo"></div>
                        <div class="skeleton-nav"></div>
                    </div>
                    <div class="skeleton-container">
                        <div class="skeleton-title"></div>
                        <div class="skeleton-text line-long"></div>
                        <div class="skeleton-text line-medium"></div>
                        <div class="skeleton-text line-short"></div>
                        <div class="skeleton-gap"></div>
                        <div class="skeleton-card"></div>
                        <div class="skeleton-card"></div>
                    </div>
                    <div class="skeleton-spinner"></div>
                `;
                
                document.body.appendChild(overlay);
                
                // Make body visible again but coverage by overlay
                if (style.parentNode) {
                    style.parentNode.removeChild(style);
                }
            }
        }, 10);
    }
})();
