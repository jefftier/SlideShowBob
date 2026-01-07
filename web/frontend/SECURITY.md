# Security Policy

## Minimum Enterprise Baseline Checklist

This document outlines the minimum security requirements for enterprise deployment of SlideShowBob Web Application.

### ✅ Implemented

- [x] **Content Security Policy (CSP)** - Meta tag in `index.html` (see below for production headers)
- [x] **TypeScript Strict Mode** - Enabled in `tsconfig.json`
- [x] **Dependency Scanning** - `npm audit` shows 0 vulnerabilities (as of last check)

### ⚠️ Requires Server Configuration

The following security headers must be configured at the web server/CDN level for production deployments:

#### Required HTTP Headers

```http
# Content Security Policy (CSP)
# Note: The meta tag in index.html provides baseline protection
# For production, enforce via HTTP header for better security
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';

# HTTP Strict Transport Security (HSTS)
# Force HTTPS connections (only set in production with HTTPS enabled)
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

# Prevent clickjacking
X-Frame-Options: DENY

# Prevent MIME type sniffing
X-Content-Type-Options: nosniff

# Referrer Policy
Referrer-Policy: strict-origin-when-cross-origin

# Permissions Policy (formerly Feature Policy)
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

#### Server Configuration Examples

**nginx:**
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

**Apache (.htaccess):**
```apache
<IfModule mod_headers.c>
  Header set Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
  Header set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
  Header set X-Frame-Options "DENY"
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
  Header set Permissions-Policy "geolocation=(), microphone=(), camera=()"
</IfModule>
```

**Cloudflare (Page Rules or Transform Rules):**
Configure via Cloudflare dashboard or Workers:
```javascript
response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';");
response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
response.headers.set('X-Frame-Options', 'DENY');
response.headers.set('X-Content-Type-Options', 'nosniff');
response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
```

### Security Considerations

#### CSP 'unsafe-inline' and 'unsafe-eval'

The current CSP includes `'unsafe-inline'` and `'unsafe-eval'` for scripts, which is required for Vite's development server and build process. For enhanced security in production:

1. **Consider nonce-based CSP:** Generate nonces server-side and inject into HTML
2. **Use hash-based CSP:** Calculate hashes of inline scripts and include in CSP
3. **Review Vite build output:** Ensure all scripts are externalized where possible

**Note:** Removing `'unsafe-inline'` may break the application if Vite generates inline scripts. Test thoroughly before deploying stricter CSP.

#### File System Access API

This application uses the File System Access API, which:
- Requires user interaction to access directories (security by design)
- Only works in secure contexts (HTTPS or localhost)
- Directory handles are stored in IndexedDB (browser-managed, not exposed to scripts)

**Security Note:** The File System Access API is a browser security feature. Directory handles cannot be used to access files outside the user-selected directory.

#### Manifest File Validation

Manifest files (JSON) are parsed from user-selected directories. Security measures:
- File size limits (see PR6)
- Path traversal protection (see PR6)
- Schema validation (see PR6)

### Dependency Security

- **Regular Audits:** Run `npm audit` before each release
- **Dependabot:** Configured for automated dependency updates (see PR16)
- **Lock File:** `package-lock.json` is committed to ensure reproducible builds

### Reporting Security Issues

If you discover a security vulnerability, please:
1. **Do not** open a public issue
2. Email security concerns to the repository maintainers
3. Include steps to reproduce the issue
4. Allow time for remediation before public disclosure

### Security Checklist for Deployment

Before deploying to production:

- [ ] Verify all security headers are configured in web server/CDN
- [ ] Ensure HTTPS is enabled and properly configured
- [ ] Run `npm audit` and verify no vulnerabilities
- [ ] Review CSP policy and test application functionality
- [ ] Verify HSTS is only enabled on HTTPS (not HTTP)
- [ ] Test file system access in target browsers
- [ ] Review and test manifest file validation
- [ ] Verify Service Worker is properly configured (see PR13)
- [ ] Test error handling and recovery mechanisms (see PR3)
- [ ] Verify memory leak fixes are deployed (see PR2)

### Future Security Enhancements

Planned security improvements (see ENTERPRISE_REVIEW_REPORT.md):

- [ ] Nonce-based CSP for production (remove 'unsafe-inline')
- [ ] Source map exclusion from production builds
- [ ] Error tracking integration (Sentry/rollbar) for security monitoring
- [ ] SAST (Static Analysis) with ESLint security plugin
- [ ] Automated security testing in CI/CD pipeline

### References

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [OWASP: Secure Headers](https://owasp.org/www-project-secure-headers/)
- [File System Access API Security](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API#security_considerations)

