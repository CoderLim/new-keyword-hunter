# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Chrome extension built with Plasmo framework that mines emerging keywords from Google Trends through recursive exploration. The extension uses a side panel UI to control crawling, monitors Google Trends API requests via webRequest, and identifies "new words" based on timeline analysis.

## Development Commands

```bash
# Install dependencies
npm install

# Development mode (starts Plasmo dev server + auto-copies side-panel files)
npm run dev

# Production build (builds extension + copies static files + patches manifest)
npm run build

# Package for distribution
npm run package

# Run tests (TypeScript compilation + Node test runner)
npm test
```

After `npm run dev`, load `build/chrome-mv3-dev` as an unpacked extension in Chrome.

## Architecture Overview

### Core Components

**Background Service Worker** (`src/background.ts`):
- Orchestrates the entire crawling workflow
- Intercepts Google Trends API requests via `chrome.webRequest`
- Manages keyword queue, processing state, and crawl lifecycle
- Implements rate-limit detection (429 responses) and automatic finalization
- Coordinates between content scripts and side panel UI

**Side Panel UI** (`static/side-panel.html` + `static/side-panel.js`):
- User interface for starting/stopping crawls and viewing results
- React components in `src/components/` (InputSection, StatusDisplay, EffectiveWords, HistoryList)
- Note: Static files in `static/` are copied during build, not processed by Plasmo

**Content Script** (`src/contents/trends-monitor.ts`):
- Runs on `trends.google.com` pages
- Monitors page-level events and forwards data to background script

**Library Utilities** (`src/lib/`):
- `trends.ts`: Google Trends API parsing (related queries, timeline data, XSSI prefix removal)
- `keyword-analyzer.ts`: New word identification algorithm (zero-value detection, threshold comparison)
- `storage.ts`: Chrome storage wrapper for state, queue, and history management

### Data Flow

1. User starts crawl with base keyword + seed keywords
2. Background script adds seeds to queue, processes keywords one by one
3. For each keyword, background opens Google Trends page with keyword + base keyword
4. Background intercepts API responses (`/trends/api/widgetdata/*`)
5. Related queries are extracted and added to queue
6. Timeline data is analyzed to determine if keyword is "effective new word"
7. Process repeats until queue is empty or max keywords reached

### New Word Identification Algorithm

A keyword is considered "effective" if:
1. First 5 timeline points are all zero (emerging word indicator)
2. `(candidate_last_5_avg / base_last_5_avg) × 100 >= threshold`

When base keyword is present, comparison is done between two timeline series. When absent, single keyword timeline is analyzed.

## Key Technical Details

### Build Process

- Plasmo handles main extension bundling
- `scripts/dev.js`: Watches and copies `static/side-panel.*` files during development
- `scripts/fix-manifest.js`: Post-build manifest patching
- Build output: `build/chrome-mv3-dev` (dev) or `build/chrome-mv3-prod` (prod)

### Path Aliases

Use `~lib/`, `~types`, `~components/` for imports (configured in Plasmo).

### Duplicate Request Prevention

Background script maintains `recentInterceptSignatures` map with 60s TTL to deduplicate identical API responses.

### Rate Limiting

Extension detects Google Trends 429 responses on `/trends/api/explore*` and `/trends/explore*` endpoints and automatically finalizes the crawl with "abnormal" end type.

### State Management

All state persists in Chrome storage via `@plasmohq/storage`:
- `captureState`: Current crawl status (active, processed count, queue size, etc.)
- `captureOptions`: User-configured parameters
- `keywordsQueue`: Pending keywords to process
- `processedKeywords`: Set of already-processed keywords
- `effectiveNewWords`: Set of identified new words
- `historyRecords`: Past crawl results

## Testing

Currently uses Node.js built-in test runner. Tests compile TypeScript to `.tmp-tests/` directory with CommonJS format.

Test files: `tests/trends.test.ts`, `tests/keyword-analyzer.test.ts`

## Code Style

- TypeScript with ES modules
- 2-space indentation, double quotes, no semicolons (match existing files)
- `camelCase` for variables/functions
- `PascalCase` for React components
- `kebab-case` for utility filenames
