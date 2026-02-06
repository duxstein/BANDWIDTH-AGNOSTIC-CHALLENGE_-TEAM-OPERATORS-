# DataLite Portal - Architecture

## Overview

DataLite Portal is a Chrome Extension (Manifest V3) that optimizes browsing by blocking heavy resources, compressing content, and providing real-time analytics.

---

## System Architecture

```mermaid
graph TB
    subgraph Chrome["Chrome Browser"]
        subgraph Extension["DataLite Extension"]
            BG[background.js<br/>Service Worker]
            DNR[rules.json<br/>Declarative Net Request]
            
            subgraph ContentScripts["Content Scripts"]
                LD[loader.js<br/>document_start]
                MW[middleware.js<br/>MAIN world]
                PU[purifier.js<br/>document_end]
                CT[content.js<br/>document_end]
                ME[metrics.js<br/>document_end]
            end
            
            subgraph Popup["Popup UI"]
                PH[popup.html]
                PC[popup.css]
                PJ[popup.js]
            end
        end
        
        ST[(chrome.storage.local)]
    end
    
    WEB[Web Page] -->|HTTP Request| DNR
    DNR -->|Block/Allow| WEB
    BG <-->|Messages| ContentScripts
    BG <-->|Toggle Rules| DNR
    BG <-->|Stats| ST
    Popup <-->|Status| ST
    ContentScripts -->|Metrics| ST
```

---

## Request Flow

```mermaid
sequenceDiagram
    participant User
    participant Popup
    participant BG as background.js
    participant DNR as rules.json
    participant Page as Web Page
    participant CS as Content Scripts
    
    User->>Popup: Toggle Lite Mode ON
    Popup->>BG: storage.set(liteModeEnabled: true)
    BG->>DNR: Enable blocking ruleset
    
    User->>Page: Navigate to website
    DNR-->>Page: Block images, fonts, media, trackers
    BG->>BG: Track blocked bytes (webRequest)
    
    Page->>CS: DOM Ready (document_end)
    CS->>CS: loader.js shows skeleton
    CS->>CS: purifier.js cleans DOM
    CS->>CS: middleware.js intercepts fetch
    CS->>CS: metrics.js collects data
    
    CS->>BG: GET_BANDWIDTH_STATS
    BG-->>CS: {blockedRequests, blockedBytes}
    CS->>CS: Generate console report
```

---

## Component Details

### 1. Background Service Worker (`background.js`)

| Responsibility | Implementation |
|----------------|----------------|
| DNR Rule Toggle | `updateEnabledRulesets()` |
| Bandwidth Tracking | `webRequest.onCompleted` |
| Blocked Stats | `onRuleMatchedDebug` callback |
| Message Hub | `runtime.onMessage` |
| Lifetime Stats | `storage.local` aggregation |

### 2. Declarative Net Request (`rules.json`)

**12 Blocking Rules:**
- Images (except CAPTCHA)
- Fonts, Media, Objects
- Analytics & Trackers
- Social Widgets
- CSS CDNs
- Video Embeds
- Chat Widgets
- Cookie Banners

### 3. Content Scripts

| Script | Run At | World | Purpose |
|--------|--------|-------|---------|
| `loader.js` | document_start | ISOLATED | Show skeleton loader |
| `middleware.js` | document_start | MAIN | Intercept fetch, cache, compress |
| `purifier.js` | document_end | ISOLATED | Clean DOM (Hard/Soft mode) |
| `content.js` | document_end | ISOLATED | Bridge popup ↔ content |
| `metrics.js` | document_end | ISOLATED | Collect & report analytics |

### 4. Purifier Modes

```
┌─────────────────────────────────────────────────────────┐
│                    cleanHTML()                          │
│                         │                               │
│         ┌───────────────┴───────────────┐               │
│         ▼                               ▼               │
│   ┌─────────────┐               ┌─────────────┐         │
│   │  Hard Mode  │               │  Soft Mode  │         │
│   │ Rebuild DOM │               │  Hide Media │         │
│   │ Static Sites│               │ ASP.NET/SPA │         │
│   └─────────────┘               └─────────────┘         │
└─────────────────────────────────────────────────────────┘
```

### 5. Metrics Pipeline

```
PerformanceObserver ──► FP, FCP, LCP, Long Tasks
Resource Timing API ──► transferSize, decodedBodySize
background.js ────────► blockedRequests, blockedBytes
purifier.js ──────────► DOM blocked count
         │
         ▼
    console.table() + Lifetime Storage
```

---

## Data Flow

```mermaid
flowchart LR
    subgraph Input
        REQ[HTTP Requests]
        DOM[Page DOM]
    end
    
    subgraph Processing
        DNR[DNR Blocking]
        MW[Middleware Cache]
        PU[DOM Purifier]
    end
    
    subgraph Output
        LITE[Lite Page]
        STATS[Analytics]
        STORE[Storage]
    end
    
    REQ --> DNR --> MW --> LITE
    DOM --> PU --> LITE
    DNR --> STATS
    MW --> STATS
    PU --> STATS
    STATS --> STORE
```

---

## File Structure

```
datalite-portal/
├── manifest.json          # Extension config
├── background.js          # Service worker
├── rules.json             # DNR blocking rules
├── content.js             # Popup bridge
├── purifier.js            # DOM cleaner
├── purifier.css           # Lite mode styles
├── middleware.js          # Fetch interceptor
├── metrics.js             # Analytics
├── loader.js              # Skeleton UI
├── loader.css             # Skeleton styles
└── popup/
    ├── popup.html         # Toggle UI
    ├── popup.css          # Dark theme
    └── popup.js           # Toggle logic
```

---

## Storage Schema

```javascript
chrome.storage.local = {
    liteModeEnabled: boolean,
    totalBlockedItems: number,
    lifetimeBlockedRequests: number,
    lifetimeBlockedBytes: number,
    sessionCount: number,
    lastUpdated: timestamp
}
```
