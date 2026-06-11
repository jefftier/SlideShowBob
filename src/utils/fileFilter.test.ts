import { describe, it, expect } from 'vitest'
import { filterMediaByFileList } from './fileFilter'
import { MediaItem, MediaType } from '../types/media'

/** Helper to create a minimal MediaItem */
function makeItem(fileName: string, relativePath = ''): MediaItem {
  return {
    filePath: relativePath ? `${relativePath}/${fileName}` : fileName,
    fileName,
    type: MediaType.Image,
    relativePath,
  }
}

describe('filterMediaByFileList', () => {
  describe('basic filtering and ordering', () => {
    it('returns matched items in the order specified by fileList', () => {
      const items = [
        makeItem('alpha.jpg'),
        makeItem('beta.png'),
        makeItem('gamma.gif'),
      ]

      const result = filterMediaByFileList(items, ['gamma.gif', 'alpha.jpg'])

      expect(result.matched).toHaveLength(2)
      expect(result.matched[0].fileName).toBe('gamma.gif')
      expect(result.matched[1].fileName).toBe('alpha.jpg')
      expect(result.missing).toEqual([])
    })

    it('returns empty matched array when fileList is empty', () => {
      const items = [makeItem('photo.jpg')]
      const result = filterMediaByFileList(items, [])

      expect(result.matched).toEqual([])
      expect(result.missing).toEqual([])
    })

    it('returns empty matched array when mediaItems is empty', () => {
      const result = filterMediaByFileList([], ['photo.jpg'])

      expect(result.matched).toEqual([])
      expect(result.missing).toEqual(['photo.jpg'])
    })

    it('filters to only items matching the fileList', () => {
      const items = [
        makeItem('keep.jpg'),
        makeItem('skip.png'),
        makeItem('also-keep.gif'),
      ]

      const result = filterMediaByFileList(items, ['keep.jpg', 'also-keep.gif'])

      expect(result.matched).toHaveLength(2)
      expect(result.matched.map(i => i.fileName)).toEqual(['keep.jpg', 'also-keep.gif'])
    })
  })

  describe('case-insensitive matching', () => {
    it('matches file names regardless of case', () => {
      const items = [makeItem('Photo.JPG'), makeItem('VIDEO.mp4')]

      const result = filterMediaByFileList(items, ['photo.jpg', 'video.MP4'])

      expect(result.matched).toHaveLength(2)
      expect(result.matched[0].fileName).toBe('Photo.JPG')
      expect(result.matched[1].fileName).toBe('VIDEO.mp4')
      expect(result.missing).toEqual([])
    })

    it('matches mixed case in fileList against mixed case in media', () => {
      const items = [makeItem('SuNsEt.PNG')]

      const result = filterMediaByFileList(items, ['SUNSET.png'])

      expect(result.matched).toHaveLength(1)
      expect(result.matched[0].fileName).toBe('SuNsEt.PNG')
    })
  })

  describe('multiple items with same file name in different subfolders', () => {
    it('includes all items matching the same file name', () => {
      const items = [
        makeItem('photo.jpg', 'folder-a'),
        makeItem('photo.jpg', 'folder-b'),
        makeItem('photo.jpg', 'folder-c'),
      ]

      const result = filterMediaByFileList(items, ['photo.jpg'])

      expect(result.matched).toHaveLength(3)
      expect(result.matched.every(i => i.fileName === 'photo.jpg')).toBe(true)
      expect(result.missing).toEqual([])
    })

    it('groups all subfolder matches at the position of the file entry', () => {
      const items = [
        makeItem('a.jpg', 'dir1'),
        makeItem('b.png', 'dir1'),
        makeItem('a.jpg', 'dir2'),
      ]

      const result = filterMediaByFileList(items, ['b.png', 'a.jpg'])

      expect(result.matched).toHaveLength(3)
      expect(result.matched[0].fileName).toBe('b.png')
      expect(result.matched[1].fileName).toBe('a.jpg')
      expect(result.matched[2].fileName).toBe('a.jpg')
    })
  })

  describe('deduplication — same name in fileList only matched once', () => {
    it('includes matching items only at the first occurrence position', () => {
      const items = [makeItem('sunset.jpg')]

      const result = filterMediaByFileList(items, ['sunset.jpg', 'sunset.jpg', 'sunset.jpg'])

      expect(result.matched).toHaveLength(1)
      expect(result.matched[0].fileName).toBe('sunset.jpg')
    })

    it('deduplicates case-insensitively', () => {
      const items = [makeItem('Beach.PNG')]

      const result = filterMediaByFileList(items, ['beach.png', 'BEACH.PNG', 'Beach.png'])

      expect(result.matched).toHaveLength(1)
      expect(result.matched[0].fileName).toBe('Beach.PNG')
    })

    it('preserves first-occurrence ordering when duplicates exist', () => {
      const items = [
        makeItem('alpha.jpg'),
        makeItem('beta.png'),
      ]

      const result = filterMediaByFileList(items, ['beta.png', 'alpha.jpg', 'beta.png'])

      expect(result.matched).toHaveLength(2)
      expect(result.matched[0].fileName).toBe('beta.png')
      expect(result.matched[1].fileName).toBe('alpha.jpg')
    })
  })

  describe('missing files reported correctly', () => {
    it('reports file names that do not match any media item', () => {
      const items = [makeItem('exists.jpg')]

      const result = filterMediaByFileList(items, ['exists.jpg', 'missing.png', 'gone.gif'])

      expect(result.matched).toHaveLength(1)
      expect(result.missing).toEqual(['missing.png', 'gone.gif'])
    })

    it('reports all as missing when none match', () => {
      const items = [makeItem('photo.jpg')]

      const result = filterMediaByFileList(items, ['no-match.png', 'also-missing.gif'])

      expect(result.matched).toEqual([])
      expect(result.missing).toEqual(['no-match.png', 'also-missing.gif'])
    })

    it('does not report duplicates in missing when same missing name appears multiple times in fileList', () => {
      const items = [makeItem('photo.jpg')]

      const result = filterMediaByFileList(items, ['missing.png', 'missing.png'])

      // Second occurrence is a duplicate and gets skipped entirely
      expect(result.missing).toEqual(['missing.png'])
    })
  })
})
