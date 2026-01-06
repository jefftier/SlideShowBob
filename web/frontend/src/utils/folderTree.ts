// Utility functions for building and managing folder tree structure

export interface FolderNode {
  name: string;
  fullPath: string; // Full path from root (e.g., "subfolder/nested")
  parentPath: string | null; // Parent folder path (null for root)
  children: FolderNode[];
  fileCount: number;
  isExpanded?: boolean;
  rootFolderName: string; // Track the root folder name for this node
}

export interface FileItem {
  filePath: string;
  fileName: string;
  folderPath: string; // Path of the folder containing this file
}

/**
 * Builds a folder tree structure from media items
 */
export function buildFolderTree(playlist: Array<{ relativePath?: string; folderName?: string }>): FolderNode[] {
  const rootFolders = new Map<string, Map<string, FolderNode>>(); // rootFolderName -> path -> node
  
  // First pass: Build folder structure
  playlist.forEach(item => {
    if (!item.folderName || !item.relativePath) return;
    
    const rootName = item.folderName;
    if (!rootFolders.has(rootName)) {
      rootFolders.set(rootName, new Map());
    }
    
    const folderMap = rootFolders.get(rootName)!;
    const pathParts = item.relativePath.split('/').filter(p => p && p.trim() !== '');
    
    // Build path segments (all parts except the filename)
    let currentPath = '';
    pathParts.slice(0, -1).forEach((part) => {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!folderMap.has(currentPath)) {
        folderMap.set(currentPath, {
          name: part,
          fullPath: currentPath,
          parentPath: parentPath || null,
          children: [],
          fileCount: 0,
          isExpanded: false,
          rootFolderName: rootName
        });
      }
    });
  });
  
  // Second pass: Count files in each folder
  playlist.forEach(item => {
    if (!item.folderName || !item.relativePath) return;
    
    const rootName = item.folderName;
    const folderMap = rootFolders.get(rootName);
    if (!folderMap) return;
    
    const pathParts = item.relativePath.split('/').filter(p => p && p.trim() !== '');
    
    if (pathParts.length > 1) {
      // File is in a subfolder
      const folderPath = pathParts.slice(0, -1).join('/');
      const node = folderMap.get(folderPath);
      if (node) {
        node.fileCount++;
      } else {
        console.warn(`Folder node not found for path: ${folderPath} in root: ${rootName}, relativePath: ${item.relativePath}`);
      }
    } else {
      // File is in root - count in root folder
      if (!folderMap.has('')) {
        folderMap.set('', {
          name: rootName,
          fullPath: '',
          parentPath: null,
          children: [],
          fileCount: 0,
          isExpanded: false,
          rootFolderName: rootName
        });
      }
      folderMap.get('')!.fileCount++;
    }
  });
  
  // Third pass: Build tree structure for each root folder
  const result: FolderNode[] = [];
  
  rootFolders.forEach((folderMap, rootName) => {
    // Create root node
    const rootNode: FolderNode = {
      name: rootName,
      fullPath: '',
      parentPath: null,
      children: [],
      fileCount: folderMap.get('')?.fileCount || 0,
      isExpanded: false,
      rootFolderName: rootName
    };
    
    // Build children hierarchy
    const sortedPaths = Array.from(folderMap.keys())
      .filter(path => path !== '')
      .sort((a, b) => {
        const depthA = a.split('/').length;
        const depthB = b.split('/').length;
        if (depthA !== depthB) return depthA - depthB;
        return a.localeCompare(b);
      });
    
    sortedPaths.forEach(path => {
      const node = folderMap.get(path)!;
      const parentPath = node.parentPath;
      
      if (parentPath === null) {
        // Direct child of root
        rootNode.children.push(node);
      } else {
        // Find parent node
        const parentNode = folderMap.get(parentPath);
        if (parentNode) {
          parentNode.children.push(node);
        } else {
          console.warn(`Parent node not found for path: ${path}, parentPath: ${parentPath}`);
        }
      }
    });
    
    // Sort children alphabetically
    const sortChildren = (node: FolderNode) => {
      node.children.sort((a, b) => a.name.localeCompare(b.name));
      node.children.forEach(sortChildren);
    };
    sortChildren(rootNode);
    
    result.push(rootNode);
  });
  
  return result;
}

/**
 * Gets all files in a specific folder path
 */
export function getFilesInFolder(
  playlist: Array<{ relativePath?: string; folderName?: string; filePath: string; fileName: string }>,
  rootFolderName: string,
  folderPath: string
): FileItem[] {
  return playlist
    .filter(item => {
      if (!item.folderName || !item.relativePath) return false;
      if (item.folderName !== rootFolderName) return false;
      
      const pathParts = item.relativePath.split('/').filter(p => p && p.trim() !== '');
      if (pathParts.length === 1) {
        // File in root
        return folderPath === '';
      }
      
      const fileFolderPath = pathParts.slice(0, -1).join('/');
      return fileFolderPath === folderPath;
    })
    .map(item => ({
      filePath: item.filePath,
      fileName: item.fileName,
      folderPath: folderPath
    }));
}

/**
 * Toggles folder expansion state
 */
export function toggleFolder(
  tree: FolderNode[],
  rootFolderName: string,
  folderPath: string
): FolderNode[] {
  const findAndToggle = (nodes: FolderNode[]): FolderNode[] => {
    return nodes.map(node => {
      if (node.rootFolderName === rootFolderName && folderPath === '') {
        return { ...node, isExpanded: !node.isExpanded };
      }
      
      const toggleInChildren = (n: FolderNode): FolderNode => {
        if (n.rootFolderName === rootFolderName && n.fullPath === folderPath) {
          return { ...n, isExpanded: !n.isExpanded };
        }
        return {
          ...n,
          children: n.children.map(toggleInChildren)
        };
      };
      
      return {
        ...node,
        children: node.children.map(toggleInChildren)
      };
    });
  };
  
  return findAndToggle(tree);
}

/**
 * Sets folder expansion state
 */
export function setFolderExpanded(
  tree: FolderNode[],
  rootFolderName: string,
  folderPath: string,
  isExpanded: boolean
): FolderNode[] {
  const setExpanded = (nodes: FolderNode[]): FolderNode[] => {
    return nodes.map(node => {
      if (node.rootFolderName === rootFolderName && folderPath === '') {
        return { ...node, isExpanded };
      }
      
      const setInChildren = (n: FolderNode): FolderNode => {
        if (n.rootFolderName === rootFolderName && n.fullPath === folderPath) {
          return { ...n, isExpanded };
        }
        return {
          ...n,
          children: n.children.map(setInChildren)
        };
      };
      
      return {
        ...node,
        children: node.children.map(setInChildren)
      };
    });
  };
  
  return setExpanded(tree);
}
