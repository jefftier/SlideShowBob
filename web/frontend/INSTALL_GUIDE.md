# Frontend Installation Guide

## What You Need (Updated for Vite)

### ✅ Already Installed
- ✅ React + TypeScript (via Vite template)
- ✅ Vite (build tool)

### 📦 What You Should Install

#### 1. PWA Support (for offline/installable app)
```bash
npm install -D vite-plugin-pwa
```

**Note:** The guide mentioned `workbox-webpack-plugin`, but that's for webpack. Vite uses `vite-plugin-pwa` instead.

#### 2. File System Access (for local file access)
```bash
npm install file-system-access
```

This is important for accessing local files in the browser.

#### 3. UI Library (Choose One)

**Option A: Material-UI (MUI)**
```bash
npm install @mui/material @emotion/react @emotion/styled
npm install @mui/icons-material
```

**Option B: Tailwind CSS (Lighter weight)**
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**Recommendation:** Start with Tailwind CSS - it's lighter and more flexible for a slideshow app.

#### 4. TypeScript Types (Optional but helpful)
```bash
npm install -D @types/node
```

---

## Quick Install (Recommended)

Run this to install everything you need:

```bash
# PWA support
npm install -D vite-plugin-pwa

# File system access
npm install file-system-access

# UI library (Tailwind - recommended)
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# TypeScript types
npm install -D @types/node
```

---

## What You DON'T Need

- ❌ `workbox-webpack-plugin` - That's for webpack, you're using Vite
- ❌ `@types/node` is optional (but helpful)

---

## After Installation

1. **Configure Vite for PWA** - Update `vite.config.ts` (create if needed)
2. **Configure Tailwind** - Update `tailwind.config.js`
3. **Start building!**

