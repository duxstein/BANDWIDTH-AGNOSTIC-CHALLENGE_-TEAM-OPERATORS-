# DataLite PWA

Lightweight Progressive Web App wrapper for university portals.

## Quick Start

### Option 1: Local Development
```bash
cd pwa
npx serve .
```
Open http://localhost:3000

### Option 2: Python Server
```bash
cd pwa
python -m http.server 8080
```
Open http://localhost:8080

## Files

| File | Purpose | Size |
|------|---------|------|
| `index.html` | App shell | ~2KB |
| `styles.css` | Dark theme | ~5KB |
| `app.js` | Main logic | ~4KB |
| `service-worker.js` | Caching & blocking | ~5KB |
| `manifest.webmanifest` | PWA config | ~2KB |
| **Total** | | **~18KB** |

## Features

- ⚡ Instant loading with app shell
- 📡 Offline support
- 📦 Cache-first strategy
- 🚫 Blocks heavy resources
- 📱 Installable (Add to Home Screen)
- 📊 Real-time metrics

## Integration with Extension

The extension sends cleaned content via `postMessage`:

```javascript
// From extension content script:
window.postMessage({
    type: 'DATALITE_CLEANED_CONTENT',
    url: window.location.href,
    html: cleanedHTML
}, '*');
```

The PWA receives and renders it:

```javascript
// In app.js:
window.addEventListener('message', (event) => {
    if (event.data.type === 'DATALITE_CLEANED_CONTENT') {
        renderContent(event.data.html);
    }
});
```

## Generate Icons

The `icons/icon.svg` can be converted to PNG using:

```bash
# Using ImageMagick
convert -background none icon.svg -resize 192x192 icon-192.png
convert -background none icon.svg -resize 512x512 icon-512.png

# Or use online converter: https://cloudconvert.com/svg-to-png
```

Required sizes: 72, 96, 128, 144, 152, 192, 384, 512

## Lighthouse Score

Target scores:
- Performance: 90+
- Accessibility: 90+
- Best Practices: 90+
- PWA: ✓ Installable
