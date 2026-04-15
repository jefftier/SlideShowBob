export enum MediaType {
  Image = 'Image',
  Gif = 'Gif',
  Video = 'Video'
}

export type MediaItem = {
  filePath: string;
  fileName: string;
  type: MediaType;
  dateModified?: number;
  file?: File; // File object for web File System Access API
  objectUrl?: string; // Object URL created from file
  folderName?: string; // Name of the root folder this item belongs to
  relativePath?: string; // Path relative to the root folder
}

export function determineMediaType(filePath: string): MediaType {
  const ext = filePath.toLowerCase().split('.').pop() || '';
  if (ext === 'mp4' || ext === 'webm' || ext === 'ogg') {
    return MediaType.Video;
  }
  if (ext === 'gif') {
    return MediaType.Gif;
  }
  return MediaType.Image;
}

