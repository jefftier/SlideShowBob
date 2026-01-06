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
- Node.js 18+ and npm
- Modern browser with File System Access API support (Chrome, Edge, or Opera)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Open your browser to the URL shown (typically `http://localhost:5173`)

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

1. **Add Folders**: Click the "Add Folder" button (or folder icon in toolbar) to select a directory containing your media files
2. **Navigate**: Use arrow keys or toolbar buttons to navigate between media
3. **Start Slideshow**: Click the play button to start automatic playback
4. **Adjust Settings**: Use the settings button to configure preferences
5. **View Playlist**: Click the playlist button to see all loaded media and manage the playlist

## Browser Compatibility

The File System Access API is currently supported in:
- Chrome 86+
- Edge 86+
- Opera 72+

For other browsers, you may need to use a backend API to serve files instead.

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

