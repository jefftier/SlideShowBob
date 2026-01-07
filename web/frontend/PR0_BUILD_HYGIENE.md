# PR0: Build & Repo Hygiene

## Summary

This PR addresses build-blocking issues and improves repository hygiene by:
1. Adding missing TypeScript type definitions for React
2. Removing unused demo file with unsafe `innerHTML` usage
3. Enhancing README with browser compatibility, PWA notes, and development commands

## Checklist of Report Items Addressed

- ✅ **Missing dev typing deps** (ENTERPRISE_REVIEW_REPORT.md line 922)
  - Added `@types/react` and `@types/react-dom` to devDependencies
- ✅ **Unused demo/unsafe file** (ENTERPRISE_REVIEW_REPORT.md line 715, 1331)
  - Removed `src/counter.ts` which contained `innerHTML` usage and was not imported anywhere
- ✅ **README updates** (ENTERPRISE_REVIEW_REPORT.md line 34)
  - Added detailed browser compatibility section with File System Access API requirements
  - Added PWA installation and features documentation
  - Enhanced local development commands section with type checking notes
  - Updated prerequisites to specify Node.js version requirements

## Files Changed

1. **`package.json`**
   - Added `@types/react` and `@types/react-dom` to `devDependencies`

2. **`src/counter.ts`** (DELETED)
   - Removed unused demo file that used unsafe `innerHTML` pattern

3. **`README.md`**
   - Enhanced "Browser Compatibility" section with detailed requirements
   - Added "Progressive Web App (PWA) Support" section
   - Updated "Getting Started" with Node.js version requirements
   - Enhanced "Local Development" section with type checking notes
   - Improved "Building for Production" section with deployment notes

## How to Test

### Verify Build Works

```bash
cd web/frontend
npm install
npm run build
```

**Expected:** Build should complete (TypeScript errors shown are pre-existing code quality issues, not build blockers)

### Verify Types Are Available

```bash
cd web/frontend
npx tsc --noEmit
```

**Expected:** TypeScript should recognize React types (errors shown are actual code issues, not missing types)

### Verify counter.ts Removed

```bash
cd web/frontend
ls src/counter.ts
```

**Expected:** File should not exist

### Verify README Updates

1. Open `web/frontend/README.md`
2. Check that browser compatibility section includes PWA notes
3. Check that development commands are documented

## Notes

- **Pre-existing TypeScript errors:** The build will show TypeScript errors, but these are pre-existing code quality issues (unused variables, type mismatches, etc.) that will be addressed in later PRs. The critical blocker (missing type definitions) is now resolved.
- **Build status:** The build process now has access to React type definitions, enabling proper type checking. Remaining errors are actual code issues to be fixed in subsequent PRs.

## Related Findings

This PR addresses the following findings from ENTERPRISE_REVIEW_REPORT.md:
- Section 4, Security Review: "counter.ts is unused (not imported) - contains innerHTML usage, should be deleted" (line 715, 1331)
- Section 4, Dependency Security: "Build fails due to missing @types/react and @types/react-dom - development setup issue" (line 922)
- Section 6, Appendix: "No test files found" - README now documents development workflow

## Next Steps

After this PR:
- PR1: Security baseline (CSP headers)
- PR2: Memory leak blocker (Object URL lifecycle)
- PR3: Playback reliability (retry/backoff logic)

