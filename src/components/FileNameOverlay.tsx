import React, { useMemo } from 'react';
import { MediaItem } from '../types/media';
import {
  MetadataOverlayMode,
  SMART_DEFAULT_FIELDS,
  formatFieldValue,
  getFieldLabel,
} from '../types/metadata';
import './FileNameOverlay.css';

interface FileNameOverlayProps {
  currentMedia: MediaItem | null;
  visible: boolean;
  metadataMode?: MetadataOverlayMode;
  metadataFields?: string[];
}

/**
 * Resolves which metadata lines to display for the current item, based on the
 * configured overlay mode:
 * - 'off': no metadata lines
 * - 'smart': a small curated preset (title, subreddit) - only fields that exist on
 *   this particular entry are shown, so it degrades gracefully per-item
 * - 'custom': exactly the fields the user picked in Settings, in that order
 * - 'all': every field found on this entry, in the app's canonical known-field
 *   order first, followed by any unrecognized fields
 */
function resolveMetadataLines(
  metadata: Record<string, string | number | boolean | undefined> | undefined,
  mode: MetadataOverlayMode,
  customFields: string[]
): string[] {
  if (!metadata || mode === 'off') return [];

  const keysInEntry = Object.keys(metadata).filter((k) => metadata[k] !== undefined);
  if (keysInEntry.length === 0) return [];

  let keysToShow: string[];
  if (mode === 'smart') {
    keysToShow = SMART_DEFAULT_FIELDS.filter((k) => keysInEntry.includes(k));
  } else if (mode === 'custom') {
    keysToShow = customFields.filter((k) => keysInEntry.includes(k));
  } else {
    // 'all' - show everything present on this entry
    keysToShow = keysInEntry;
  }

  const lines: string[] = [];
  for (const key of keysToShow) {
    const value = metadata[key];
    if (value === undefined || value === '') continue;
    const formatted = formatFieldValue(key, value);
    if (!formatted) continue;
    // "Standalone" fields (title, subreddit, author, score, nsfw) read fine as-is;
    // everything else gets a "Label: value" prefix for context.
    const needsLabel = !['title', 'subreddit', 'author', 'score', 'nsfw'].includes(key);
    lines.push(needsLabel ? `${getFieldLabel(key)}: ${formatted}` : formatted);
  }
  return lines;
}

/**
 * Small, unobtrusive overlay showing the current media's file name/path and,
 * optionally, selected fields from its metadata.json entry (if the source folder
 * has one). Positioned top-left, semi-transparent, and non-interactive
 * (pointer-events: none) so it never interferes with slideshow interaction.
 * Follows the same show/hide behavior as the toolbar (hidden during idle/fullscreen
 * playback).
 */
const FileNameOverlay: React.FC<FileNameOverlayProps> = ({
  currentMedia,
  visible,
  metadataMode = 'off',
  metadataFields = [],
}) => {
  const displayPath = useMemo(() => {
    if (!currentMedia) return '';
    const relative = currentMedia.relativePath || currentMedia.fileName;
    if (currentMedia.folderName && !relative.startsWith(currentMedia.folderName)) {
      return `${currentMedia.folderName}/${relative}`;
    }
    return relative;
  }, [currentMedia]);

  const metadataLines = useMemo(
    () => resolveMetadataLines(currentMedia?.metadata, metadataMode, metadataFields),
    [currentMedia, metadataMode, metadataFields]
  );

  if (!currentMedia) return null;

  const hasMetadata = metadataLines.length > 0;
  const titleAttr = hasMetadata ? [displayPath, ...metadataLines].join('\n') : displayPath;

  return (
    <div
      className={`filename-overlay${visible ? '' : ' hidden'}${hasMetadata ? ' has-metadata' : ''}`}
      aria-hidden="true"
      title={titleAttr}
    >
      <div className="filename-overlay-path">{displayPath}</div>
      {hasMetadata && (
        <div className="filename-overlay-metadata">
          {metadataLines.map((line, i) => (
            <div key={i} className="filename-overlay-metadata-line">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileNameOverlay;
