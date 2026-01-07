import React from 'react';
import './ManifestModeDialog.css';

interface ManifestModeDialogProps {
  manifestName: string;
  itemCount: number;
  missingFiles: string[];
  onLoadManifest: () => void;
  onIgnore: () => void;
}

const ManifestModeDialog: React.FC<ManifestModeDialogProps> = ({
  manifestName,
  itemCount,
  missingFiles,
  onLoadManifest,
  onIgnore
}) => {
  return (
    <div className="manifest-dialog-overlay">
      <div className="manifest-dialog">
        <div className="manifest-dialog-header">
          <h2>Slideshow Playlist Detected</h2>
        </div>
        <div className="manifest-dialog-content">
          <p>
            A playlist manifest file was found: <strong>{manifestName}</strong>
          </p>
          <p>
            This playlist contains <strong>{itemCount}</strong> item{itemCount !== 1 ? 's' : ''}.
          </p>
          {missingFiles.length > 0 && (
            <div className="manifest-dialog-warning">
              <p><strong>Warning:</strong> {missingFiles.length} file{missingFiles.length !== 1 ? 's' : ''} from the playlist could not be found:</p>
              <ul>
                {missingFiles.slice(0, 5).map((file, index) => (
                  <li key={index}>{file}</li>
                ))}
                {missingFiles.length > 5 && (
                  <li>... and {missingFiles.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
          <div className="manifest-dialog-info">
            <p><strong>Manifest Mode:</strong></p>
            <ul>
              <li>Only files in the playlist will be shown</li>
              <li>Custom delays per file (if specified)</li>
              <li>Automatic fullscreen when slideshow starts</li>
              <li>Reduced UI controls</li>
            </ul>
          </div>
        </div>
        <div className="manifest-dialog-footer">
          <button className="manifest-dialog-btn-secondary" onClick={onIgnore}>
            Ignore Manifest
          </button>
          <button className="manifest-dialog-btn-primary" onClick={onLoadManifest}>
            Load in Manifest Mode
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManifestModeDialog;

