// Manifest file format for custom slideshow playlists

export interface ManifestItem {
  file: string; // Relative path from root folder (e.g., "image.jpg" or "subfolder/video.mp4")
  delay?: number; // Delay in milliseconds (optional, uses default if not specified)
  zoom?: number; // Zoom level (optional, 1.0 = 100%)
  fit?: boolean; // Fit to window (optional, default true)
}

export interface SlideshowManifest {
  version: string; // Manifest format version
  name?: string; // Optional name for the slideshow
  defaultDelay?: number; // Default delay in milliseconds (optional, uses app setting)
  items: ManifestItem[]; // List of files to display in order
}

// Validation result
export interface ManifestValidationResult {
  valid: boolean;
  manifest?: SlideshowManifest;
  error?: string;
  fileName?: string;
}

