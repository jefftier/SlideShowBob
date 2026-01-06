# Quick Start: Setting Up Web App Development

## Answer: **Keep Same Repository & Workspace**

✅ **Use the same git repository**  
✅ **Use the same Cursor workspace**  
✅ **Create monorepo structure** (desktop/ and web/ folders)

---

## Why This Approach?

1. **Preserve History** - Keep all your git commits
2. **Easy Reference** - Can look at desktop code while building web
3. **Share Resources** - Documentation, assets, icons
4. **Parallel Development** - Work on both simultaneously
5. **Gradual Migration** - Move features over time

---

## Quick Setup (5 Minutes)

### Option 1: Run Setup Script (Easiest)

```powershell
# In your SlideShowBob directory
.\setup-web-app.ps1
```

This will:
- Create folder structure
- Update .gitignore
- Create placeholder READMEs

### Option 2: Manual Setup

```powershell
# Create folders
mkdir web, web\frontend, web\backend, web\shared
mkdir desktop, shared, shared\docs, shared\assets

# Initialize frontend (choose one)
cd web\frontend
npm create vite@latest . -- --template react-ts
# OR
npx create-react-app . --template typescript
```

---

## Folder Structure

```
SlideShowBob/                    # Your current repo (keep it!)
├── desktop/                     # Move existing WPF app here (optional)
│   ├── MainWindow.xaml
│   ├── ViewModels/
│   └── SlideShowBob.csproj
│
├── web/                         # NEW - Web app
│   ├── frontend/                # React/Vue frontend
│   ├── backend/                 # Node.js backend (optional)
│   └── shared/                  # Shared TypeScript types
│
├── shared/                      # Shared resources
│   ├── docs/                    # Documentation
│   └── assets/                  # Icons, images
│
└── README.md                    # Root README
```

---

## What to Do Next

### 1. Initialize Web Frontend (15 min)

```bash
cd web/frontend
npm create vite@latest . -- --template react-ts
npm install
npm run dev
```

### 2. Port First Model (30 min)

Create `web/shared/types/MediaItem.ts`:
```typescript
export interface MediaItem {
  filePath: string;
  type: 'Image' | 'GIF' | 'Video';
  fileName: string;
}
```

Port from your `MediaItem.cs` file.

### 3. Create First Component (1 hour)

Create `web/frontend/src/components/SlideshowViewer.tsx`:
```typescript
import { MediaItem } from '../../shared/types/MediaItem';

export function SlideshowViewer() {
  // Your slideshow component
}
```

---

## Workspace Configuration

Your `SlideShowBob.code-workspace` will automatically work, or update it:

```json
{
  "folders": [
    { "path": "." },
    { "path": "./desktop", "name": "Desktop App" },
    { "path": "./web/frontend", "name": "Web Frontend" }
  ]
}
```

---

## Git Strategy

### Option A: Same Branch (Simple)
- Just commit web files alongside desktop
- Use prefixes: `feat(web):` or `feat(desktop):`

### Option B: Separate Branch (Recommended)
```bash
git checkout -b feature/web-app
# Develop web app here
# Merge to main when ready
```

---

## Don't Move Desktop Files Yet

**You don't need to move desktop files immediately!**

- Keep them in root for now
- Move to `desktop/` folder later (or never)
- Web app can live in `web/` folder alongside

**Only move if:**
- You want cleaner organization
- You plan to maintain both long-term
- You want separate build outputs

---

## Development Workflow

### Daily Work

1. **Desktop App:**
   ```bash
   dotnet run  # (from root or desktop/)
   ```

2. **Web App:**
   ```bash
   cd web/frontend
   npm run dev
   ```

3. **Both can run simultaneously!**

---

## Common Questions

### Q: Will this mess up my existing desktop app?
**A:** No! Desktop app stays exactly as-is. Web app is separate.

### Q: Do I need to move all desktop files?
**A:** No! Only move if you want cleaner organization. You can keep them in root.

### Q: Can I delete desktop app later?
**A:** Yes! If web app works well, you can deprecate desktop. Or keep both.

### Q: What about git history?
**A:** All preserved! Same repository, same history.

### Q: Can I use a different workspace?
**A:** Yes, but same workspace works fine. Cursor handles multiple folders well.

---

## Next Steps

1. ✅ Run `.\setup-web-app.ps1` (or create folders manually)
2. ✅ Initialize React app: `cd web/frontend && npm create vite@latest . -- --template react-ts`
3. ✅ Port first model: Create `web/shared/types/MediaItem.ts`
4. ✅ Create first component: Basic slideshow viewer
5. ✅ Test File System Access API

**See [MIGRATION_SETUP_GUIDE.md](./MIGRATION_SETUP_GUIDE.md) for detailed instructions.**

---

## TL;DR

**Keep same repo & workspace. Create `web/` folder. Start building!**

```powershell
.\setup-web-app.ps1
cd web\frontend
npm create vite@latest . -- --template react-ts
npm install
npm run dev
```

That's it! 🚀

