# Security policy

Minimum expectations for deploying the SlideShowBob web app.

## Implemented in the client

- **Content Security Policy (CSP)** — Baseline via meta tag in `index.html`; prefer duplicating or tightening via HTTP headers in production.
- **TypeScript strict mode** — `tsconfig.json`.
- **Reproducible installs** — `package-lock.json` committed; run `npm audit` before releases.

## Configure at the reverse proxy / CDN

Set these (values should be reviewed against your actual asset and API origins):

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### nginx example

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

## CSP notes

`'unsafe-inline'` / `'unsafe-eval'` are common with Vite builds; tightening (nonces, hashes) requires testing the full production bundle.

## File System Access API

- Requires a **secure context** (HTTPS or localhost) and **user gesture** to pick folders.
- Handles are stored via IndexedDB helpers in-app; they do not grant access outside user-selected directories.

## Manifest files

User-supplied JSON is validated in **`src/utils/manifestValidation.ts`** (size limits, path rules, schema). Keep validation in sync with any new manifest features.

## Reporting vulnerabilities

Do not use public issues for undisclosed security problems. Contact maintainers privately with reproduction steps and allow time for a fix before disclosure.

## Pre-release checklist

- [ ] Security headers enabled on the host serving `dist/`
- [ ] HTTPS end-to-end; HSTS only where HTTPS is correct
- [ ] `npm audit` (and dependency updates via Dependabot where applicable)
- [ ] CSP tested against real production assets
- [ ] Service worker / PWA behavior verified after deploy
- [ ] Slideshow and manifest flows smoke-tested in target browsers

## References

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [OWASP: Secure Headers](https://owasp.org/www-project-secure-headers/)
- [File System Access API — security](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API#security_considerations)
