import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveFolder } from './folderResolver';

// Mock the directoryStorage module
vi.mock('./directoryStorage', () => ({
  loadDirectoryHandleByFullPath: vi.fn(),
  loadDirectoryHandleByFolderName: vi.fn(),
}));

import { loadDirectoryHandleByFullPath, loadDirectoryHandleByFolderName } from './directoryStorage';

const mockLoadByFullPath = vi.mocked(loadDirectoryHandleByFullPath);
const mockLoadByFolderName = vi.mocked(loadDirectoryHandleByFolderName);

/** Create a mock FileSystemDirectoryHandle with configurable permission behavior */
function createMockHandle(
  name: string,
  opts: { queryPermission?: PermissionState; requestPermission?: PermissionState } = {}
) {
  const { queryPermission = 'granted', requestPermission = 'granted' } = opts;
  return {
    kind: 'directory' as const,
    name,
    queryPermission: vi.fn().mockResolvedValue(queryPermission),
    requestPermission: vi.fn().mockResolvedValue(requestPermission),
  } as unknown as FileSystemDirectoryHandle;
}

describe('resolveFolder', () => {
  let onStatusChange: (message: string) => void;
  let onPromptUser: (message: string) => void;

  beforeEach(() => {
    vi.resetAllMocks();
    onStatusChange = vi.fn();
    onPromptUser = vi.fn();
    // Clear any showDirectoryPicker mock
    (window as any).showDirectoryPicker = undefined;
  });

  it('returns handle immediately when full-path match has granted permission', async () => {
    const handle = createMockHandle('Vacation Photos', { queryPermission: 'granted' });
    mockLoadByFullPath.mockResolvedValue({
      folderName: 'Vacation Photos',
      handle,
      fullPath: '/Users/jeff/Pictures/Vacation Photos',
    });

    const result = await resolveFolder({
      path: '/Users/jeff/Pictures/Vacation Photos',
      onStatusChange,
      onPromptUser,
    });

    expect(result.handle).toBe(handle);
    expect(result.folderName).toBe('Vacation Photos');
    expect(result.fullPath).toBe('/Users/jeff/Pictures/Vacation Photos');
    expect(result.source).toBe('fullPath');
    // Should not have called requestPermission or prompted user
    expect((handle as any).requestPermission).not.toHaveBeenCalled();
    expect(onPromptUser).not.toHaveBeenCalled();
    expect(mockLoadByFolderName).not.toHaveBeenCalled();
  });

  it('calls requestPermission when full-path match has prompt permission', async () => {
    const handle = createMockHandle('Vacation Photos', {
      queryPermission: 'prompt',
      requestPermission: 'granted',
    });
    mockLoadByFullPath.mockResolvedValue({
      folderName: 'Vacation Photos',
      handle,
      fullPath: '/Users/jeff/Pictures/Vacation Photos',
    });

    const result = await resolveFolder({
      path: '/Users/jeff/Pictures/Vacation Photos',
      onStatusChange,
      onPromptUser,
    });

    expect((handle as any).requestPermission).toHaveBeenCalledWith({ mode: 'read' });
    expect(onStatusChange).toHaveBeenCalledWith('Requesting access to "Vacation Photos"…');
    expect(result.handle).toBe(handle);
    expect(result.source).toBe('fullPath');
  });

  it('falls back to folder-name match when no full-path match exists', async () => {
    mockLoadByFullPath.mockResolvedValue(null);

    const handle = createMockHandle('Photos', { queryPermission: 'granted' });
    mockLoadByFolderName.mockResolvedValue({
      folderName: 'Photos',
      handle,
    });

    const result = await resolveFolder({
      path: '/Users/jeff/Pictures/Photos',
      onStatusChange,
      onPromptUser,
    });

    expect(mockLoadByFolderName).toHaveBeenCalledWith('Photos');
    expect(result.handle).toBe(handle);
    expect(result.folderName).toBe('Photos');
    expect(result.fullPath).toBe('/Users/jeff/Pictures/Photos');
    expect(result.source).toBe('folderName');
  });

  it('opens directory picker when no match exists in IndexedDB', async () => {
    mockLoadByFullPath.mockResolvedValue(null);
    mockLoadByFolderName.mockResolvedValue(null);

    const pickerHandle = createMockHandle('MyFolder');
    (window as any).showDirectoryPicker = vi.fn().mockResolvedValue(pickerHandle);

    const result = await resolveFolder({
      path: '/Users/jeff/Documents/MyFolder',
      onStatusChange,
      onPromptUser,
    });

    expect(onPromptUser).toHaveBeenCalledWith(
      'This URL wants to open /Users/jeff/Documents/MyFolder — please select this folder'
    );
    expect(onStatusChange).toHaveBeenCalledWith('Waiting for folder selection…');
    expect((window as any).showDirectoryPicker).toHaveBeenCalledWith({ mode: 'read' });
    expect(result.handle).toBe(pickerHandle);
    expect(result.folderName).toBe('MyFolder');
    expect(result.fullPath).toBe('/Users/jeff/Documents/MyFolder');
    expect(result.source).toBe('picker');
  });

  it('throws when permission is denied after requestPermission', async () => {
    const handle = createMockHandle('Vacation Photos', {
      queryPermission: 'prompt',
      requestPermission: 'denied',
    });
    mockLoadByFullPath.mockResolvedValue({
      folderName: 'Vacation Photos',
      handle,
      fullPath: '/Users/jeff/Pictures/Vacation Photos',
    });

    await expect(
      resolveFolder({
        path: '/Users/jeff/Pictures/Vacation Photos',
        onStatusChange,
        onPromptUser,
      })
    ).rejects.toThrow('Access denied for /Users/jeff/Pictures/Vacation Photos');
  });

  it('throws when queryPermission returns denied directly', async () => {
    const handle = createMockHandle('Secret', {
      queryPermission: 'denied',
    });
    mockLoadByFullPath.mockResolvedValue({
      folderName: 'Secret',
      handle,
      fullPath: '/private/Secret',
    });

    await expect(
      resolveFolder({
        path: '/private/Secret',
        onStatusChange,
        onPromptUser,
      })
    ).rejects.toThrow('Access denied for /private/Secret');
  });
});
