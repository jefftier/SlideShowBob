# PR1: Security Baseline (CSP + Headers)

## Summary

This PR establishes the security baseline by:
1. Adding Content Security Policy (CSP) meta tag to `index.html` for client-side XSS protection
2. Creating `SECURITY.md` with minimum enterprise baseline checklist
3. Documenting required production HTTP security headers with server configuration examples

## Checklist of Report Items Addressed

- ✅ **No CSP Headers** (ENTERPRISE_REVIEW_REPORT.md line 17, 287, 695, 707-732)
  - Added CSP meta tag to `index.html` with appropriate directives
  - Documented production header configuration in `SECURITY.md`
- ✅ **Security Headers Missing** (ENTERPRISE_REVIEW_REPORT.md line 288, 933)
  - Documented HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
  - Provided server configuration examples (nginx, Apache, Cloudflare)
- ✅ **Minimum Enterprise Baseline Checklist** (ENTERPRISE_REVIEW_REPORT.md line 928-939)
  - Created `SECURITY.md` with comprehensive security checklist
  - Documented deployment security requirements

## Files Changed

1. **`index.html`**
   - Added CSP meta tag with directives:
     - `default-src 'self'` - Default to same-origin only
     - `script-src 'self' 'unsafe-inline' 'unsafe-eval'` - Required for Vite (see notes)
     - `style-src 'self' 'unsafe-inline'` - Required for Tailwind CSS
     - `img-src 'self' blob: data:` - Allow object URLs and data URIs for media
     - `media-src 'self' blob:` - Allow object URLs for video/audio
     - `object-src 'none'` - Block plugins
     - `frame-ancestors 'none'` - Prevent clickjacking
     - `base-uri 'self'` - Restrict base tag
     - `form-action 'self'` - Restrict form submissions

2. **`SECURITY.md`** (NEW)
   - Minimum enterprise baseline checklist
   - Required HTTP headers documentation
   - Server configuration examples (nginx, Apache, Cloudflare)
   - Security considerations and notes
   - Deployment security checklist
   - Future security enhancements roadmap

## How to Test

### Verify CSP Meta Tag

1. Open `web/frontend/index.html` in a text editor
2. Verify CSP meta tag is present in `<head>` section
3. Check that all required directives are included

### Test CSP in Browser

1. Start dev server: `npm run dev`
2. Open browser DevTools → Console
3. Verify no CSP violations are logged
4. Test application functionality:
   - Add folder
   - Play slideshow
   - Navigate media
   - Open settings/playlist

**Expected:** Application should work normally with CSP enabled

### Verify SECURITY.md

1. Open `web/frontend/SECURITY.md`
2. Verify all sections are present:
   - Implemented checklist
   - Required HTTP headers
   - Server configuration examples
   - Security considerations
   - Deployment checklist

### Test Production Headers (Optional)

If you have access to a production server:

1. Configure security headers per `SECURITY.md` examples
2. Deploy application
3. Use browser DevTools → Network → Response Headers
4. Verify headers are present:
   - `Content-Security-Policy`
   - `Strict-Transport-Security` (HTTPS only)
   - `X-Frame-Options`
   - `X-Content-Type-Options`
   - `Referrer-Policy`

**Expected:** All security headers should be present in production responses

## Notes

### CSP 'unsafe-inline' and 'unsafe-eval'

The CSP includes `'unsafe-inline'` and `'unsafe-eval'` for scripts because:
- Vite's development server uses inline scripts for HMR (Hot Module Replacement)
- Vite's build process may generate inline scripts
- Removing these directives may break the application

**Future Enhancement (PR13+):** Consider migrating to nonce-based CSP for production builds to remove `'unsafe-inline'`.

### Meta Tag vs HTTP Header

- **Meta tag (current):** Provides baseline protection, works in all environments
- **HTTP header (production):** More secure, can override meta tag, recommended for production

The meta tag is sufficient for development and provides protection even if server headers are misconfigured. Production deployments should use HTTP headers as documented in `SECURITY.md`.

### Frame-Ancestors

The CSP includes `frame-ancestors 'none'` which prevents the app from being embedded in iframes. This is appropriate for a slideshow application that should run in its own window.

## Security Impact

**Before:**
- ❌ No XSS protection via CSP
- ❌ No security headers documentation
- ❌ No deployment security checklist

**After:**
- ✅ CSP meta tag provides XSS protection
- ✅ Comprehensive security documentation
- ✅ Clear deployment requirements

## Related Findings

This PR addresses the following findings from ENTERPRISE_REVIEW_REPORT.md:
- Section 4, Security Review: "No CSP Headers" (line 17, 287, 695, 707-732)
- Section 4, Security Review: "Security Headers Missing" (line 288, 933)
- Section 4, Security Review: "Minimum Enterprise Baseline Checklist" (line 928-939)

## Next Steps

After this PR:
- PR2: Memory leak blocker (Object URL lifecycle)
- PR3: Playback reliability (retry/backoff logic)
- PR6: Manifest hardening (path validation, size limits)
- PR13: PWA/service worker hardening (consider CSP nonce migration)

