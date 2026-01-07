# PR18: Dev Dependencies Audit Fix

## Summary

Resolved 5 moderate severity vulnerabilities in dev dependencies (vitest/vite/esbuild chain) by upgrading vitest from 2.1.8 to 4.0.16 and vite from 7.2.4 to 7.3.0. All vulnerabilities cleared without breaking builds or tests.

## Audit Summary

### Before
```
5 moderate severity vulnerabilities

esbuild  <=0.24.2
Severity: moderate
esbuild enables any website to send any requests to the development server and read the response
- https://github.com/advisories/GHSA-67mh-4wv8-2f99

Affected packages:
- node_modules/vite-node/node_modules/esbuild
- node_modules/vitest/node_modules/esbuild
- vite 0.11.0 - 6.1.6 (depends on vulnerable esbuild)
- vitest 0.0.1 - 0.0.12 || 0.0.29 - 0.0.122 || 0.3.3 - 3.0.0-beta.4 (depends on vulnerable vite)
```

### After
```
found 0 vulnerabilities
```

## Changes

### Package Upgrades
**File:** `web/frontend/package.json`

- **vite:** `^7.2.4` → `^7.3.0`
  - Upgraded to latest stable 7.x version
  - Includes fixed esbuild dependency

- **vitest:** `^2.1.8` → `^4.0.16`
  - Major version upgrade (2.x → 4.x)
  - Uses vite ^6.0.0 || ^7.0.0 (compatible with vite 7.3.0)
  - Includes fixed esbuild via updated vite dependency chain

## Technical Details

### Upgrade Strategy
- Upgraded vitest to latest stable (4.0.16) as recommended by `npm audit fix`
- Upgraded vite to latest 7.x (7.3.0) to ensure compatibility and latest fixes
- Both packages upgraded together to maintain compatibility
- No breaking changes to app code required

### Compatibility
- vitest@4.0.16 requires vite ^6.0.0 || ^7.0.0 (satisfied by vite@7.3.0)
- All existing test configurations remain compatible
- Build process unchanged

## Verification

### Build Verification
```bash
cd web/frontend
npm run build
```
✅ **Result:** Build successful
- TypeScript compilation passed
- Vite build completed successfully
- All assets generated correctly

### Test Verification
```bash
cd web/frontend
npm run test:run
```
✅ **Result:** All tests passed
- Test Files: 1 passed (1)
- Tests: 11 passed (11)
- Duration: 696ms

### Audit Verification
```bash
cd web/frontend
npm audit
```
✅ **Result:** 0 vulnerabilities found

## Notes

- Node.js version warning: Vite 7.3.0 recommends Node.js 20.19+ or 22.12+, but current version (22.9.0) still works. This is a warning only and does not affect functionality.
- The upgrade resolved the esbuild vulnerability chain by ensuring all packages use esbuild >0.24.2
- No app code changes were required; this was a dev dependency-only fix

## Verification Commands

To verify the fix locally:

```bash
cd web/frontend
npm audit              # Should show 0 vulnerabilities
npm run build         # Should build successfully
npm run test:run      # Should pass all tests
```

