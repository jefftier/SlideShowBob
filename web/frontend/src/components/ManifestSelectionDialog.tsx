import React from 'react';
import './ManifestSelectionDialog.css';

interface ManifestFile {
  name: string;
  itemCount: number;
}

interface ManifestSelectionDialogProps {
  manifests: ManifestFile[];
  onSelect: (index: number) => void;
  onIgnore: () => void;
}

const ManifestSelectionDialog: React.FC<ManifestSelectionDialogProps> = ({
  manifests,
  onSelect,
  onIgnore
}) => {
  return (
    <div className="manifest-selection-overlay">
      <div className="manifest-selection-dialog">
        <div className="manifest-selection-header">
          <h2>Multiple Playlist Files Found</h2>
        </div>
        <div className="manifest-selection-content">
          <p>
            Multiple playlist manifest files were found in this folder. 
            Please select which one to use, or ignore all.
          </p>
          <div className="manifest-selection-list">
            {manifests.map((manifest, index) => (
              <button
                key={index}
                className="manifest-selection-item"
                onClick={() => onSelect(index)}
              >
                <div className="manifest-selection-item-name">{manifest.name}</div>
                <div className="manifest-selection-item-count">
                  {manifest.itemCount} item{manifest.itemCount !== 1 ? 's' : ''}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="manifest-selection-footer">
          <button className="manifest-selection-btn-secondary" onClick={onIgnore}>
            Ignore All
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManifestSelectionDialog;

