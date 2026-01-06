import React from 'react';
import { FolderNode } from '../utils/folderTree';
import './PlaylistWindow.css';

interface FolderTreeProps {
  tree: FolderNode[];
  selectedRootFolder: string | null;
  selectedFolderPath: string;
  onSelectFolder: (rootName: string, folderPath: string) => void;
  onToggleExpand: (rootName: string, folderPath: string) => void;
  onRemoveFolder: (folderName: string) => void;
}

const FolderTree: React.FC<FolderTreeProps> = ({
  tree,
  selectedRootFolder,
  selectedFolderPath,
  onSelectFolder,
  onToggleExpand,
  onRemoveFolder
}) => {
  const renderNode = (node: FolderNode, level: number = 0): React.ReactNode => {
    const isRoot = node.parentPath === null;
    const rootFolderName = node.rootFolderName;
    const isSelected = selectedRootFolder === rootFolderName && 
                     (isRoot ? selectedFolderPath === '' : selectedFolderPath === node.fullPath);
    const hasChildren = node.children.length > 0;
    const indent = level * 20;

    const handleExpandClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggleExpand(rootFolderName, node.fullPath);
    };

    const handleFolderClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Select the folder - this will show files in this folder
      // For root folders, fullPath is '', for subfolders it's the path like "subfolder" or "subfolder/nested"
      // Use the rootFolderName from the node itself
      console.log('Clicking folder node:', {
        nodeName: node.name,
        rootFolderName: rootFolderName,
        fullPath: node.fullPath,
        isRoot
      });
      onSelectFolder(rootFolderName, node.fullPath);
    };

    const handleRemove = (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemoveFolder(node.name);
    };

    return (
      <div key={isRoot ? node.name : node.fullPath}>
        <div
          className={`folder-tree-item ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${8 + indent}px` }}
        >
          {/* Expand/Collapse Button */}
          {hasChildren ? (
            <button
              className="folder-tree-expand"
              onClick={handleExpandClick}
              onMouseDown={(e) => e.stopPropagation()}
              title={node.isExpanded ? 'Collapse' : 'Expand'}
            >
              {node.isExpanded ? '▼' : '▶'}
            </button>
          ) : (
            <span className="folder-tree-spacer" />
          )}
          
          {/* Folder Icon and Name */}
          <div
            className="folder-tree-content"
            onClick={handleFolderClick}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="folder-tree-icon">📁</span>
            <span className="folder-tree-name">{node.name}</span>
            <span className="folder-tree-count">({node.fileCount})</span>
          </div>
          
          {/* Remove Button (only for root folders) */}
          {isRoot && (
            <button
              className="folder-tree-remove"
              onClick={handleRemove}
              onMouseDown={(e) => e.stopPropagation()}
              title="Remove folder"
            >
              ×
            </button>
          )}
        </div>
        
        {/* Children */}
        {hasChildren && node.isExpanded && (
          <div className="folder-tree-children">
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="folder-tree">
      {tree.length === 0 ? (
        <div className="folder-tree-empty">No folders added</div>
      ) : (
        tree.map(rootNode => renderNode(rootNode, 0))
      )}
    </div>
  );
};

export default FolderTree;

