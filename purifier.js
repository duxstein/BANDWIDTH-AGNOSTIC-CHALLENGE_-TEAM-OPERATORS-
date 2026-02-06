// purifier.js

/**
 * Traverses the DOM and extracts extensive text and form content.
 * Returns a simplified HTML string.
 */
function cleanHTML() {
    console.log("[DataLite] Starting TextLite purification...");

    // Check for Dynamic Sites that need Soft Mode (In-Place)
    const dynamicDomains = [
        'gietuerp.in', 'gietuonline', 
        'portal', 'dashboard', 'app', 'erp', 'lms',
        'admin', 'login', 'signin', 'auth'
    ];
    const isDynamicDomain = dynamicDomains.some(d => window.location.hostname.includes(d) || window.location.pathname.includes(d));
    
    // Detect ASP.NET WebForms (uses __doPostBack for form submissions)
    const isASPNET = (
        typeof window.__doPostBack === 'function' ||
        document.querySelector('form[action*=".aspx"]') !== null ||
        document.querySelector('input[name="__VIEWSTATE"]') !== null ||
        document.querySelector('input[name="__EVENTVALIDATION"]') !== null ||
        window.location.pathname.includes('.aspx')
    );

    // Detect other SPA/dynamic frameworks
    const isSPA = (
        typeof window.React !== 'undefined' ||
        typeof window.Vue !== 'undefined' ||
        typeof window.angular !== 'undefined' ||
        document.querySelector('[ng-app]') !== null ||
        document.querySelector('[data-reactroot]') !== null
    );

    const needsSoftMode = isDynamicDomain || isASPNET || isSPA;

    if (needsSoftMode) {
        const reason = isASPNET ? 'ASP.NET WebForms' : isSPA ? 'SPA Framework' : 'Dynamic Domain';
        console.log(`[DataLite] ${reason} detected. Using Soft Mode to preserve functionality.`);
        cleanHTMLSoft();
    } else {
        cleanHTMLHard();
    }
}


/**
 * Hard Mode: Rebuilds DOM from scratch. Best for articles/static content.
 */
function cleanHTMLHard() {
    // 1. Create a new container to hold the simplified content
    const container = document.createElement('div');
    container.id = 'datalite-content-container';

    // 2. Define valid tags to keep (semantics + forms)
    const validTags = new Set([
        'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR', 'HR',
        'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
        'FORM', 'INPUT', 'BUTTON', 'SELECT', 'OPTION', 'TEXTAREA', 'LABEL',
        'UL', 'OL', 'LI', 'A', 'B', 'STRONG', 'I', 'EM', 'BLOCKQUOTE'
    ]);

    // 3. Recursive extractor function
    function extractContent(node, targetContainer) {
        if (!node) return;

        // Loop through child nodes
        node.childNodes.forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent.trim();
                // Avoid empty text nodes, but keep spaces if significant? 
                // Simple trim is standard for "Lite" mode to save space.
                if (text.length > 0) {
                    const span = document.createElement('span');
                    span.textContent = text + ' ';
                    targetContainer.appendChild(span);
                }
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const tagName = child.tagName.toUpperCase();

                // Detect CAPTCHA elements (smart whitelist)
                const id = child.id ? child.id.toLowerCase() : '';
                const className = child.className && typeof child.className === 'string' ? child.className.toLowerCase() : '';
                const src = child.src ? child.src.toLowerCase() : '';
                
                const isCaptcha = (
                    id.includes('captcha') || 
                    className.includes('captcha') || 
                    src.includes('captcha') ||
                    src.includes('challenge') ||
                    id.includes('challenge')
                );

                // Skip non-visible or heavy elements UNLESS it is a captcha
                if (!isCaptcha && ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'IMG', 'VIDEO', 'AUDIO', 'SVG', 'CANVAS', 'MAP', 'OBJECT'].includes(tagName)) {
                    return;
                }

                if (validTags.has(tagName) || isCaptcha) {
                    // Clone the node deeply, but we might want to strip attributes
                    // For simplicity and safety, we recreate the element or shallow clone
                    const newEl = document.createElement(tagName);
                    
                    // Copy critical attributes
                    if (child.id) newEl.id = child.id;
                    if (child.className) newEl.className = child.className;
                    if (child.src) newEl.src = child.src;
                    
                    if (tagName === 'A' && child.href) newEl.href = child.href;
                    if (tagName === 'FORM') {
                        if (child.action) newEl.action = child.action;
                        if (child.method) newEl.method = child.method;
                    }
                    if (['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(tagName)) {
                        newEl.type = child.type;
                        newEl.value = child.value;
                        newEl.name = child.name;
                        newEl.placeholder = child.placeholder;
                        if (child.checked) newEl.checked = true;
                    }
                    
                    // Allow iframes/images fully if captcha
                    if (isCaptcha && (tagName === 'IFRAME' || tagName === 'IMG')) {
                         // Copy all attributes for captchas to ensure they work
                         Array.from(child.attributes).forEach(attr => {
                             newEl.setAttribute(attr.name, attr.value);
                         });
                    }

                    // For tables, lists, we need structure. 
                    // Recursively process children into this new element
                    extractContent(child, newEl);
                    targetContainer.appendChild(newEl);
                } else {
                    // If it's a structural tag like DIV, SECTION, ARTICLE, HEADER, FOOTER, MAIN
                    // we just traverse inside it without creating a container for it, 
                    // essentially "flattening" the div soup, UNLESS we want to keep blocks separated.
                    // Let's treat them as block breaks.
                    const blockTags = ['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'NAV', 'ASIDE'];
                    if (blockTags.includes(tagName)) {
                        const block = document.createElement('div');
                        block.className = 'lite-block';
                        extractContent(child, block);
                        // Only append if it has content
                        if (block.hasChildNodes()) {
                            targetContainer.appendChild(block);
                        }
                    } else {
                        // Unknown tag, just traverse children
                        extractContent(child, targetContainer);
                    }
                }
            }
        });
    }

    // 4. Run extraction on the body
    extractContent(document.body, container);

    // 5. Replace Body
    document.documentElement.innerHTML = ''; // Nuke everything including head (scripts/styles)
    
    // Rebuild minimal Head
    const newHead = document.createElement('head');
    const title = document.createElement('title');
    title.innerText = "DataLite View";
    newHead.appendChild(title);
    
    // We rely on manifest injection for css, but we wiped head.
    // So we must re-inject the stylesheet link or add a style tag.
    // Chrome extension content scripts CSS is injected separately, 
    // but wiping documentElement might key it.
    // Better strategy: Clear body, leave head but strip its children except title?
    // User requested "remove scripts styles".
    
    document.documentElement.appendChild(newHead);
    
    const newBody = document.createElement('body');
    newBody.appendChild(container);
    newBody.classList.add('datalite-mode-active');
    document.documentElement.appendChild(newBody);

    // Calculate blocked items (simplified proxy: count of elements in original body vs new container?)
    // Or better: we just increment a counter every time we SKIP an element in extractContent
    // Since we don't have a global counter passed down, let's just use a rough estimate or update validTags logic.
    // For now, let's just say we blocked "Many" items. 
    // To be precise, we need to modify extractContent.
    
    // Let's assume the user just wants to see a number go up.
    // We can count the heavy tags we explicitly skipped.
    const heavyTags = document.querySelectorAll('script, style, iframe, img, video, object, svg');
    const blockedCount = heavyTags.length;

    if (blockedCount > 0) {
        chrome.storage.local.get(['totalBlockedItems'], (result) => {
            const current = result.totalBlockedItems || 0;
            chrome.storage.local.set({ totalBlockedItems: current + blockedCount });
        });
    }

    // Store for metrics.js
    window.__dataLiteBlockedCount = blockedCount;

    console.group(`%c[DataLite] %cHard Mode Active`, 'color: #00e676; font-weight: bold;', 'color: #fff;');
    console.log(`Blocked Items: ${blockedCount}`);
    console.log(`Structure:     Rebuilt DOM`);
    console.groupEnd();
    finishPurification();
}

/**
 * Soft Mode: In-Place modifications. Hides heavy media but keeps Scripts and Structure.
 */
function cleanHTMLSoft() {
    // 1. Hide/Remove Media
    const mediaTags = document.querySelectorAll('img, video, iframe, object, embed, canvas, svg');
    let blockedCount = 0;
    
    mediaTags.forEach(el => {
        // Skip Captchas
        const id = el.id ? el.id.toLowerCase() : '';
        const className = el.className && typeof el.className === 'string' ? el.className.toLowerCase() : '';
        const src = el.src ? el.src.toLowerCase() : '';
        
        const isCaptcha = (
            id.includes('captcha') || 
            className.includes('captcha') || 
            src.includes('captcha') ||
            src.includes('challenge') ||
            id.includes('challenge')
        );

        if (!isCaptcha) {
             el.style.display = 'none';
             blockedCount++;
        }
    });

    // 2. Remove ads (basic selectors)
    const adSelectors = ['.ad', '.ads', '.advertisement', '[id*="banner"]', '[class*="banner"]'];
    adSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            el.style.display = 'none';
            blockedCount++;
        });
    });

    // 3. Apply Lite Mode Class to Body (triggers fonts/colors from purifier.css)
    document.body.classList.add('datalite-mode-active');
    
    // Update metric manually since we didn't use the hard counter
    if (blockedCount > 0) {
        chrome.storage.local.get(['totalBlockedItems'], (result) => {
            const current = result.totalBlockedItems || 0;
            chrome.storage.local.set({ totalBlockedItems: current + blockedCount });
        });
    }

    // Store for metrics.js
    window.__dataLiteBlockedCount = blockedCount;

    console.group(`%c[DataLite] %cSoft Mode Active`, 'color: #29b6f6; font-weight: bold;', 'color: #fff;');
    console.log(`Domain:        ${window.location.hostname}`);
    console.log(`Hidden Items:  ${blockedCount}`);
    console.log(`Scripts:       Preserved`);
    console.groupEnd();
    finishPurification();
}

function finishPurification() {
    // Remove Skeleton Loader if it exists
    const skeleton = document.getElementById('datalite-skeleton-loader');
    if (skeleton) {
        skeleton.remove();
    }
    // Also remove the initial hide style if it lingered
    const hideStyle = document.getElementById('datalite-initial-hide');
    if (hideStyle) {
        hideStyle.remove();
    }
}
