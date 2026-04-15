# SlideShowBob

Browser-based slideshow: **React 18**, **TypeScript**, **Vite**. Opens local media folders with the **File System Access API** (Chrome, Edge, and other Chromium browsers that support it).

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173` when `PORT` is unset).

| Command | Description |
|--------|-------------|
| `npm run dev` | Vite dev server + HMR |
| `npm run build` | Typecheck + production build → `dist/` |
| `npm start` / `npm run preview` | `vite preview` (after build; honors `PORT` and `vite.config.ts` — e.g. Railway) |
| `npm run test:run` | Vitest (CI-style) |
| `npm test` | Vitest watch mode |

## Features

- **Media** — Images (JPEG, PNG, WebP, …), animated GIFs (canvas engine), video (formats the browser decodes)
- **Slideshow** — Auto delay, manual nav, sort modes (name, date, random), fullscreen, zoom/pan, playlist, settings
- **Shortcuts** — `←`/`→` prev/next, `Space` play/pause, `F` fullscreen, `+`/`-` zoom, `0` reset zoom, `Escape` exit fullscreen / close modals

## Requirements

- Node.js **20.19+** or **22.12+** (Vite 7)
- npm
- A Chromium-class browser for **folder picking** (Firefox/Safari do not implement the File System Access API the same way)

## Progressive Web App

The production build registers a service worker (Vite PWA) for offline assets and install prompts where supported.

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/README.md](docs/README.md) | Doc index |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, playback, GIF, manifests |
| [docs/SECURITY.md](docs/SECURITY.md) | Headers, CSP, deployment checklist |

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci`, `npm run build`, and `npm run test:run` on pushes and PRs to `main` / `master`.

## License

See the repository license file if one is present.
