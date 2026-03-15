# Repository Guidelines

## Project Structure & Module Organization
Core extension logic lives in `src/`.
- `src/background.ts`: background service worker, message handling, crawl orchestration.
- `src/contents/trends-monitor.ts`: content script that watches Google Trends pages.
- `src/lib/`: domain utilities (`trends.ts`, `keyword-analyzer.ts`, `storage.ts`).
- `src/components/`: React UI pieces used by the side panel experience.
- `src/types.ts`: shared TypeScript contracts.

Static side-panel assets are in `static/` (`side-panel.html`, `side-panel.js`). Build helpers are in `scripts/` (`fix-manifest.js`). Icons and packaged visuals are in `assets/`.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start dev server plus dev-manifest side-panel patching.
- `npm run build`: create production build and patch production manifest.
- `npm run package`: package the extension for distribution.

After `npm run dev`, load `build/chrome-mv3-dev` as an unpacked extension in Chrome.

## Coding Style & Naming Conventions
Use TypeScript/ES modules with 2-space indentation, double quotes, and no semicolons (match existing files). Prefer small focused functions in `src/lib/` for reusable logic.

Naming patterns:
- `camelCase` for variables/functions (`processNextKeyword`).
- `PascalCase` for React components (`StatusDisplay.tsx`).
- `kebab-case` for utility filenames (`keyword-analyzer.ts`).

Use path aliases already present in code (for example `~lib/storage`, `~types`) instead of long relative imports.

## Testing Guidelines
There is currently no dedicated automated test suite or `npm test` script. Validate changes with:
1. `npm run build` (must succeed).
2. Manual extension test in Chrome on `trends.google.com`.
3. Smoke-check side panel flows: start capture, stop capture, export JSON/TXT.

If adding tests, place them next to modules as `*.test.ts` or under `src/**/__tests__/` and keep them fast and deterministic.

## Commit & Pull Request Guidelines
Keep commits small and single-purpose. Repository history shows concise summaries, often with a type prefix (for example `feat:`) plus direct Chinese descriptions.

PRs should include:
- clear change summary and motivation,
- impacted files/modules,
- validation steps (`npm run build`, manual checks),
- screenshots or short recordings for UI/side-panel changes.

Link related issues when available and note any follow-up work explicitly.
