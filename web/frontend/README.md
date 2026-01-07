# SlideShowBob Web App

A modern web-based slideshow application that replicates the functionality of the SlideShowBob desktop app. Built with React, TypeScript, and the File System Access API.

## Features

### Media Support
- **Images**: JPEG, PNG, BMP, TIFF, WebP, and other common image formats
- **Animated GIFs**: Full support with optimized loading
- **Videos**: MP4, WebM, OGG, MOV, AVI, MKV, WMV and other formats

### Slideshow Features
- **Automatic Playback**: Configurable delay between slides (milliseconds)
- **Manual Navigation**: Previous/Next controls with keyboard shortcuts
- **Multiple Sort Modes**: 
  - Name (A-Z, Z-A)
  - Date (Oldest First, Newest First)
  - Random
- **Fullscreen Mode**: Immersive viewing experience with F11 toggle
- **Zoom & Pan**: Interactive zoom controls with mouse wheel and keyboard
- **Video Playback**: Full video support with auto-advance
- **Playlist Management**: Visual playlist management with search and filtering
- **Video Auto-Advance**: Automatically advances to next item when video ends

### Keyboard Shortcuts
- `←` / `→`: Previous/Next media
- `Space`: Play/Pause slideshow
- `F`: Toggle fullscreen
- `+` / `-`: Zoom in/out
- `0`: Reset zoom to 100%
- `Escape`: Exit fullscreen or close modals

## Getting Started

### Prerequisites
- **Node.js 20.19+ or 22.12+** (required for Vite 7)
- **npm** (comes with Node.js)
- **Modern browser** with File System Access API support (Chrome 86+, Edge 86+, or Opera 72+)

### Local Development

1. **Install dependencies:**
```bash
npm install
```

2. **Start development server:**
```bash
npm run dev
```

3. **Open your browser** to the URL shown (typically `http://localhost:5173`)

4. **Type checking** (in another terminal):
```bash
npm run build
```

**Development Notes:**
- The dev server uses Vite's HMR (Hot Module Replacement) for fast development
- TypeScript strict mode is enabled - fix type errors before committing
- Service Worker is disabled in development mode for easier debugging

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory, including:
- Optimized JavaScript and CSS bundles
- Service Worker for PWA functionality
- Static assets (icons, manifest, etc.)

**Production Deployment:**
- Serve the `dist` directory via a web server (nginx, Apache, etc.)
- Ensure HTTPS is enabled (required for File System Access API and Service Workers)
- Configure security headers (see `SECURITY.md` for details)

## Continuous Integration

This project uses GitHub Actions for CI/CD. The CI pipeline runs automatically on pull requests and pushes to `main`/`master` branches.

### CI Pipeline

The CI workflow:
- Runs on **Node.js 20** (LTS)
- Installs dependencies with `npm ci`
- Builds the project with `npm run build`
- Runs tests with `npm run test:run`
- Blocks merges if any step fails

### Running CI Checks Locally

To verify your changes before pushing, run the same commands locally:

```bash
cd web/frontend
npm ci
npm run build
npm run test:run
```

This ensures your code will pass CI checks before creating a pull request.

### Dependency Updates

Dependabot is configured to:
- Check for npm dependency updates **weekly**
- Create PRs for minor and patch updates
- Group updates by dependency type (production vs development)
- Limit to **5 open PRs** at a time

## Usage

1. **Add Folders**: Click the "Add Folder" button (or folder icon in toolbar) to select a directory containing your media files
2. **Navigate**: Use arrow keys or toolbar buttons to navigate between media
3. **Start Slideshow**: Click the play button to start automatic playback
4. **Adjust Settings**: Use the settings button to configure preferences
5. **View Playlist**: Click the playlist button to see all loaded media and manage the playlist

## Browser Compatibility

### Required Browser Features

This application requires the **File System Access API** for direct file access. Supported browsers:
- **Chrome 86+** (recommended)
- **Edge 86+** (recommended)
- **Opera 72+**

**Note:** Firefox and Safari do not currently support the File System Access API. For these browsers, a backend API would be required to serve files.

### Progressive Web App (PWA) Support

This application is a Progressive Web App (PWA) that can be installed on supported devices:
- **Installation:** When visiting the app, browsers will prompt to "Install" or "Add to Home Screen"
- **Offline Support:** The app caches its assets via a Service Worker for offline use
- **Auto-Updates:** The Service Worker automatically updates when new versions are available
- **Best Experience:** For long-running slideshow playback, install the PWA for better performance and stability

**PWA Installation:**
- **Chrome/Edge:** Click the install icon in the address bar, or use the browser menu
- **Mobile:** Use "Add to Home Screen" from the browser menu

## Architecture

- **React 18**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server
- **File System Access API**: Direct file access from browser
- **Tailwind CSS**: Styling (via PostCSS)

## Development Notes

### File System Access API Limitations

The File System Access API has some limitations:
- Requires user interaction to access directories
- Directory handles cannot be persisted across page reloads without IndexedDB
- Only works in secure contexts (HTTPS or localhost)

For production, consider:
- Storing directory handles in IndexedDB for persistence
- Implementing a backend API for file serving
- Using a hybrid approach with both local and cloud storage

## Future Enhancements

- [ ] Store directory handles in IndexedDB for persistence
- [ ] Backend API for file serving (for browsers without File System Access API)
- [ ] Image editing features (crop, rotate, adjust)
- [ ] Cloud storage integration
- [ ] Share playlists via URL
- [ ] Export slideshow to video
- [ ] Advanced transitions between slides
- [ ] Touch gestures for mobile devices

## License

Same as the main SlideShowBob project.

