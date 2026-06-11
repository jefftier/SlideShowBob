import { describe, it, expect } from 'vitest'
import { parseUrlParams } from './urlParams'

describe('parseUrlParams', () => {
  describe('path extraction and decoding', () => {
    it('extracts a simple path parameter', () => {
      const result = parseUrlParams('?path=/Users/jeff/Pictures')
      expect(result.path).toBe('/Users/jeff/Pictures')
      expect(result.error).toBeNull()
    })

    it('decodes URI-encoded characters in path', () => {
      const result = parseUrlParams('?path=/Users/jeff/Vacation%20Photos')
      expect(result.path).toBe('/Users/jeff/Vacation Photos')
    })

    it('decodes special characters like # and &', () => {
      const result = parseUrlParams('?path=/Users/jeff/Photos%20%26%20Videos')
      expect(result.path).toBe('/Users/jeff/Photos & Videos')
    })

    it('returns null path when no path parameter is present', () => {
      const result = parseUrlParams('?autoplay=true')
      expect(result.path).toBeNull()
      expect(result.error).toBeNull()
    })

    it('returns null path for empty search string', () => {
      const result = parseUrlParams('')
      expect(result.path).toBeNull()
    })
  })

  describe('path with empty/whitespace values ignored', () => {
    it('ignores empty path value', () => {
      const result = parseUrlParams('?path=')
      expect(result.path).toBeNull()
      expect(result.error).toBeNull()
    })

    it('ignores whitespace-only path value', () => {
      const result = parseUrlParams('?path=%20%20%20')
      expect(result.path).toBeNull()
      expect(result.error).toBeNull()
    })

    it('ignores tab-only path value', () => {
      const result = parseUrlParams('?path=%09')
      expect(result.path).toBeNull()
      expect(result.error).toBeNull()
    })
  })

  describe('multiple path params uses first', () => {
    it('uses the first path parameter when multiple are present', () => {
      const result = parseUrlParams('?path=/first/path&path=/second/path')
      expect(result.path).toBe('/first/path')
    })

    it('uses first even if it would be ignored (empty)', () => {
      const result = parseUrlParams('?path=&path=/second/path')
      // First path is empty → ignored, returns null
      expect(result.path).toBeNull()
    })
  })

  describe('path traversal rejection', () => {
    it('rejects path with .. segment', () => {
      const result = parseUrlParams('?path=/Users/../etc/passwd')
      expect(result.path).toBeNull()
      expect(result.error).toBe('Invalid path: contains path traversal sequences')
    })

    it('rejects path ending with ..', () => {
      const result = parseUrlParams('?path=/Users/jeff/..')
      expect(result.path).toBeNull()
      expect(result.error).not.toBeNull()
    })

    it('rejects path starting with ..', () => {
      const result = parseUrlParams('?path=../etc/passwd')
      expect(result.path).toBeNull()
      expect(result.error).not.toBeNull()
    })

    it('rejects path that is just ..', () => {
      const result = parseUrlParams('?path=..')
      expect(result.path).toBeNull()
      expect(result.error).not.toBeNull()
    })

    it('rejects percent-encoded traversal %2e%2e', () => {
      const result = parseUrlParams('?path=/Users/%2e%2e/etc/passwd')
      expect(result.path).toBeNull()
      expect(result.error).not.toBeNull()
    })

    it('rejects mixed-case percent-encoded traversal %2E%2E', () => {
      const result = parseUrlParams('?path=/Users/%2E%2E/etc')
      expect(result.path).toBeNull()
      expect(result.error).not.toBeNull()
    })

    it('does not reject paths with dots that are not traversal', () => {
      const result = parseUrlParams('?path=/Users/jeff/.hidden/file.txt')
      expect(result.path).toBe('/Users/jeff/.hidden/file.txt')
      expect(result.error).toBeNull()
    })

    it('does not reject paths with ... (triple dot)', () => {
      const result = parseUrlParams('?path=/Users/jeff/.../something')
      expect(result.path).toBe('/Users/jeff/.../something')
      expect(result.error).toBeNull()
    })

    it('discards file params when path has traversal', () => {
      const result = parseUrlParams('?path=/Users/../etc&file=photo.jpg')
      expect(result.path).toBeNull()
      expect(result.files).toEqual([])
      expect(result.error).not.toBeNull()
    })
  })

  describe('file param extraction, deduplication, ordering', () => {
    it('extracts a single file parameter', () => {
      const result = parseUrlParams('?path=/photos&file=sunset.jpg')
      expect(result.files).toEqual(['sunset.jpg'])
    })

    it('extracts multiple file parameters preserving order', () => {
      const result = parseUrlParams('?path=/photos&file=sunset.jpg&file=beach.png&file=mountains.gif')
      expect(result.files).toEqual(['sunset.jpg', 'beach.png', 'mountains.gif'])
    })

    it('deduplicates file entries preserving first occurrence', () => {
      const result = parseUrlParams('?path=/photos&file=a.jpg&file=b.jpg&file=a.jpg')
      expect(result.files).toEqual(['a.jpg', 'b.jpg'])
    })

    it('caps file entries at 100', () => {
      const fileParams = Array.from({ length: 120 }, (_, i) => `file=file${i}.jpg`).join('&')
      const result = parseUrlParams(`?path=/photos&${fileParams}`)
      expect(result.files.length).toBe(100)
      expect(result.files[0]).toBe('file0.jpg')
      expect(result.files[99]).toBe('file99.jpg')
    })

    it('decodes URI-encoded file names', () => {
      const result = parseUrlParams('?path=/photos&file=my%20photo.jpg')
      expect(result.files).toEqual(['my photo.jpg'])
    })
  })

  describe('file params without path are ignored', () => {
    it('ignores file params when no path parameter is present', () => {
      const result = parseUrlParams('?file=sunset.jpg&file=beach.png')
      expect(result.files).toEqual([])
      expect(result.path).toBeNull()
    })

    it('ignores file params when path is empty', () => {
      const result = parseUrlParams('?path=&file=sunset.jpg')
      expect(result.files).toEqual([])
    })

    it('ignores file params when path is whitespace-only', () => {
      const result = parseUrlParams('?path=%20&file=sunset.jpg')
      expect(result.files).toEqual([])
    })
  })

  describe('file entry validation (separators, length, empty)', () => {
    it('excludes file entries containing forward slash', () => {
      const result = parseUrlParams('?path=/photos&file=sub/photo.jpg&file=valid.jpg')
      expect(result.files).toEqual(['valid.jpg'])
      expect(result.warnings.length).toBe(1)
      expect(result.warnings[0]).toContain('path separator')
    })

    it('excludes file entries containing backslash', () => {
      const result = parseUrlParams('?path=/photos&file=sub\\photo.jpg&file=valid.jpg')
      expect(result.files).toEqual(['valid.jpg'])
      expect(result.warnings.length).toBe(1)
      expect(result.warnings[0]).toContain('path separator')
    })

    it('excludes file entries exceeding 255 characters', () => {
      const longName = 'a'.repeat(256) + '.jpg'
      const result = parseUrlParams(`?path=/photos&file=${longName}&file=valid.jpg`)
      expect(result.files).toEqual(['valid.jpg'])
      expect(result.warnings.length).toBe(1)
      expect(result.warnings[0]).toContain('255')
    })

    it('allows file entries exactly 255 characters', () => {
      const exactName = 'a'.repeat(251) + '.jpg' // 255 chars total
      const result = parseUrlParams(`?path=/photos&file=${exactName}`)
      expect(result.files).toEqual([exactName])
      expect(result.warnings).toEqual([])
    })

    it('excludes empty file entries silently (no warning)', () => {
      const result = parseUrlParams('?path=/photos&file=&file=valid.jpg&file=')
      expect(result.files).toEqual(['valid.jpg'])
      expect(result.warnings).toEqual([])
    })

    it('handles all invalid entries resulting in empty file list', () => {
      const result = parseUrlParams('?path=/photos&file=&file=sub/bad.jpg')
      expect(result.files).toEqual([])
      // Warning for the separator entry, but not for empty
      expect(result.warnings.length).toBe(1)
    })
  })

  describe('autoplay parameter parsing', () => {
    it('sets autoplay to true when value is exactly "true"', () => {
      const result = parseUrlParams('?autoplay=true')
      expect(result.autoplay).toBe(true)
    })

    it('sets autoplay to false when value is "false"', () => {
      const result = parseUrlParams('?autoplay=false')
      expect(result.autoplay).toBe(false)
    })

    it('sets autoplay to false when value is "TRUE" (case-sensitive)', () => {
      const result = parseUrlParams('?autoplay=TRUE')
      expect(result.autoplay).toBe(false)
    })

    it('sets autoplay to false when value is "1"', () => {
      const result = parseUrlParams('?autoplay=1')
      expect(result.autoplay).toBe(false)
    })

    it('sets autoplay to false when parameter is absent', () => {
      const result = parseUrlParams('?path=/photos')
      expect(result.autoplay).toBe(false)
    })

    it('sets autoplay to false when value is empty', () => {
      const result = parseUrlParams('?autoplay=')
      expect(result.autoplay).toBe(false)
    })

    it('works alongside path and file parameters', () => {
      const result = parseUrlParams('?path=/photos&file=sunset.jpg&autoplay=true')
      expect(result.autoplay).toBe(true)
      expect(result.path).toBe('/photos')
      expect(result.files).toEqual(['sunset.jpg'])
    })
  })
})
