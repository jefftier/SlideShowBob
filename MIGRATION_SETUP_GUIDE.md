# Migration Setup Guide: Desktop → Web App

## Recommendation: **Monorepo Approach**

**Keep the same repository and workspace**, but organize into a monorepo structure. This gives you:
- ✅ Preserve git history
- ✅ Easy reference to existing code
- ✅ Share documentation/assets
- ✅ Run both apps in parallel
- ✅ Gradual migration path

---

## Step 1: Repository Structure

### Current Structure
```
SlideShowBob/
├── MainWindow.xaml
├── MainWindow.xaml.cs
├── ViewModels/
├── Services/
└── ... (desktop app files)
```

### New Monorepo Structure
```
SlideShowBob/
├── desktop/              # Existing WPF app (keep as-is)
│   ├── MainWindow.xaml
│   ├── ViewModels/
│   ├── Services/
│   └── SlideShowBob.csproj
│
├── web/                  # New web PWA app
│   ├── frontend/         # React/Vue frontend
│   │   ├── src/
│   │   ├── public/
│   │   └── package.json
│   ├── backend/          # Node.js backend (optional, for cloud)
│   │   ├── src/
│   │   └── package.json
│   └── shared/           # Shared TypeScript types/models
│       └── types/
│
├── shared/               # Shared resources
│   ├── docs/             # Documentation
│   ├── assets/           # Icons, images
│   └── scripts/          # Build scripts
│
└── README.md             # Root README
```

---

## Step 2: Setup Instructions

### Option A: Keep Same Workspace (Recommended)

1. **Create folder structure in current workspace:**
   ```powershell
   # In your current SlideShowBob directory
   mkdir web
   mkdir web\frontend
   mkdir web\backend
   mkdir web\shared
   mkdir shared
   mkdir shared\docs
   mkdir shared\assets
   ```

2. **Move existing files to `desktop/` folder:**
   ```powershell
   # Create desktop folder
   mkdir desktop
   
   # Move all current files (except web/, shared/, .git/)
   # You can do this manually or with a script
   ```

3. **Update .gitignore:**
   ```gitignore
   # Desktop app
   desktop/bin/
   desktop/obj/
   desktop/ffmpeg/
   
   # Web app
   web/frontend/node_modules/
   web/frontend/dist/
   web/frontend/.next/
   web/backend/node_modules/
   web/backend/dist/
   
   # Shared
   shared/assets/temp/
   ```

4. **Keep same Cursor workspace:**
   - Your `SlideShowBob.code-workspace` can include both folders
   - Or just work in the root, Cursor will handle it

### Option B: New Branch for Web Development

1. **Create a new branch:**
   ```bash
   git checkout -b feature/web-app
   ```

2. **Create folder structure** (same as Option A)

3. **Develop web app in this branch**
   - Desktop app stays on `main` branch
   - Merge when ready

---

## Step 3: Initialize Web App

### Frontend Setup (React + TypeScript)

```bash
# Navigate to web/frontend
cd web/frontend

# Create React app with TypeScript
npx create-react-app . --template typescript

# Or use Vite (faster, recommended)
npm create vite@latest . -- --template react-ts

# Install PWA dependencies
npm install workbox-webpack-plugin
npm install @types/node

# Install UI library
npm install @mui/material @emotion/react @emotion/styled
# OR
npm install tailwindcss postcss autoprefixer

# Install file access
npm install file-system-access
```

### Backend Setup (Node.js + Express)

```bash
# Navigate to web/backend
cd web/backend

# Initialize Node.js project
npm init -y

# Install dependencies
npm install express
npm install typescript @types/node @types/express ts-node
npm install cors dotenv
npm install multer  # For file uploads
npm install sharp   # For image processing
npm install pg      # For PostgreSQL (if using database)

# Install dev dependencies
npm install -D @types/cors @types/multer nodemon
```

### Shared Types Setup

```bash
# Navigate to web/shared
cd web/shared

# Initialize TypeScript project
npm init -y
npm install typescript
npx tsc --init

# Create types based on your C# models
# MediaItem.ts, PlaylistMediaItem.ts, etc.
```

---

## Step 4: Update Workspace Configuration

### Update `SlideShowBob.code-workspace`

```json
{
  "folders": [
    {
      "path": ".",
      "name": "SlideShowBob Root"
    },
    {
      "path": "./desktop",
      "name": "Desktop App (WPF)"
    },
    {
      "path": "./web/frontend",
      "name": "Web Frontend (React)"
    },
    {
      "path": "./web/backend",
      "name": "Web Backend (Node.js)"
    }
  ],
  "settings": {
    "files.exclude": {
      "**/node_modules": true,
      "**/bin": true,
      "**/obj": true
    }
  }
}
```

---

## Step 5: Port Shared Code

### What to Port from Desktop to Web

1. **Models/Data Structures:**
   ```typescript
   // web/shared/types/MediaItem.ts
   export interface MediaItem {
     filePath: string;
     type: 'Image' | 'GIF' | 'Video';
     fileName: string;
   }
   
   // Port from MediaItem.cs
   ```

2. **Business Logic:**
   ```typescript
   // web/shared/services/PlaylistManager.ts
   export class PlaylistManager {
     // Port logic from MediaPlaylistManager.cs
   }
   ```

3. **Settings:**
   ```typescript
   // web/shared/types/AppSettings.ts
   export interface AppSettings {
     slideDelayMs: number;
     includeVideos: boolean;
     // Port from AppSettings.cs
   }
   ```

### What NOT to Port

- ❌ WPF-specific code (XAML, ViewModels with WPF dependencies)
- ❌ Windows-specific APIs (File I/O, system integration)
- ❌ FFmpeg integration (use FFmpeg.wasm or server-side)

---

## Step 6: Development Workflow

### Daily Development

1. **Desktop App:**
   ```bash
   cd desktop
   dotnet run
   ```

2. **Web Frontend:**
   ```bash
   cd web/frontend
   npm run dev
   ```

3. **Web Backend (if needed):**
   ```bash
   cd web/backend
   npm run dev
   ```

### Build Scripts

Create `scripts/build.ps1`:
```powershell
# Build desktop
Write-Host "Building desktop app..."
cd desktop
dotnet build -c Release

# Build web frontend
Write-Host "Building web frontend..."
cd ../web/frontend
npm run build

# Build web backend (if needed)
Write-Host "Building web backend..."
cd ../backend
npm run build
```

---

## Step 7: Git Strategy

### Branching Strategy

```
main (production)
├── desktop/          # Desktop app releases
└── web/              # Web app releases

develop (development)
├── feature/web-app   # Web app development
├── feature/desktop-enhancements
└── feature/shared-logic
```

### Commit Strategy

```
feat(web): Add slideshow viewer component
fix(desktop): Fix video playback issue
docs(shared): Update architecture documentation
refactor(shared): Extract MediaItem to shared types
```

---

## Step 8: Documentation

### Update Root README.md

```markdown
# SlideShowBob

A modern slideshow application available as:
- **Desktop App** (WPF, Windows) - [`desktop/`](./desktop/README.md)
- **Web App** (PWA, Cross-platform) - [`web/`](./web/README.md)

## Quick Start

### Desktop App
```bash
cd desktop
dotnet run
```

### Web App
```bash
cd web/frontend
npm install
npm run dev
```

## Architecture

See [ARCHITECTURE.md](./shared/docs/ARCHITECTURE.md) for details.
```

### Create Web-Specific README

Create `web/README.md`:
```markdown
# SlideShowBob Web App

Progressive Web App (PWA) version of SlideShowBob.

## Setup

See [MIGRATION_SETUP_GUIDE.md](../MIGRATION_SETUP_GUIDE.md) for setup instructions.

## Development

```bash
cd frontend
npm install
npm run dev
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment instructions.
```

---

## Step 9: Migration Checklist

### Phase 1: Setup (Week 1)
- [ ] Create folder structure
- [ ] Move desktop files to `desktop/` folder
- [ ] Initialize web frontend project
- [ ] Initialize web backend project (if needed)
- [ ] Update workspace configuration
- [ ] Update .gitignore
- [ ] Create shared types folder

### Phase 2: Core Porting (Weeks 2-4)
- [ ] Port MediaItem model to TypeScript
- [ ] Port PlaylistManager logic
- [ ] Port AppSettings model
- [ ] Create basic React components
- [ ] Implement file system access

### Phase 3: Features (Weeks 5-8)
- [ ] Implement slideshow viewer
- [ ] Add image/video playback
- [ ] Implement playlist management
- [ ] Add settings UI
- [ ] Add PWA features (Service Worker, manifest)

### Phase 4: Cloud Integration (Weeks 9-12)
- [ ] Set up backend API
- [ ] Implement authentication
- [ ] Add cloud storage integration
- [ ] Implement sync functionality
- [ ] Add sharing features

---

## Alternative: Separate Repository

If you prefer a separate repository:

### Pros:
- ✅ Clean separation
- ✅ Independent versioning
- ✅ Easier to open-source one without the other

### Cons:
- ❌ Lose git history
- ❌ Harder to reference old code
- ❌ Duplicate documentation
- ❌ More repositories to manage

### If You Choose This:

1. **Create new repository:**
   ```bash
   git clone <new-repo-url> slideshowbob-web
   cd slideshowbob-web
   ```

2. **Copy relevant files:**
   - Documentation
   - Assets (icons, images)
   - Models (as reference for TypeScript)

3. **Start fresh:**
   - Initialize React/Vue project
   - Build from scratch
   - Reference desktop app as needed

---

## Recommendation

**Use Monorepo Approach (Option A):**

1. ✅ Keep existing repository
2. ✅ Create `desktop/` and `web/` folders
3. ✅ Use same Cursor workspace
4. ✅ Share documentation and assets
5. ✅ Develop both in parallel

**Why:**
- Preserves history
- Easier to reference existing code
- Single source of truth
- Gradual migration possible
- Can deprecate desktop later if needed

---

## Next Steps

1. **Create folder structure** (5 minutes)
2. **Move desktop files** (10 minutes)
3. **Initialize web frontend** (15 minutes)
4. **Update workspace** (5 minutes)
5. **Start porting models** (1-2 hours)

**Total Setup Time: ~2 hours**

Then you're ready to start building the web app! 🚀

