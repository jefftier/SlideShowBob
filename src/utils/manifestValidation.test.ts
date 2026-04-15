// Tests for manifest validation utilities
// Focus: validateMediaPath security validation

import { describe, it, expect } from 'vitest'
import { validateMediaPath } from './manifestValidation'

describe('validateMediaPath', () => {
  describe('valid paths', () => {
    it('accepts simple relative path', () => {
      expect(validateMediaPath('slides/a.jpg')).toBe('slides/a.jpg')
    })

    it('accepts nested relative path', () => {
      expect(validateMediaPath('photos/2024/vacation.jpg')).toBe('photos/2024/vacation.jpg')
    })

    it('accepts single filename', () => {
      expect(validateMediaPath('image.png')).toBe('image.png')
    })

    it('trims whitespace from valid paths', () => {
      expect(validateMediaPath('  slides/a.jpg  ')).toBe('slides/a.jpg')
    })
  })

  describe('invalid paths - security violations', () => {
    it('rejects path traversal with ../', () => {
      expect(() => validateMediaPath('../x.jpg')).toThrow("Unsafe path: contains '..' segment")
    })

    it('rejects path traversal with /../', () => {
      expect(() => validateMediaPath('slides/../x.jpg')).toThrow("Unsafe path: contains '..' segment")
    })

    it('rejects absolute Unix paths', () => {
      expect(() => validateMediaPath('/etc/passwd')).toThrow('Unsafe path: absolute paths not allowed')
    })

    it('rejects Windows drive paths', () => {
      expect(() => validateMediaPath('C:\\x')).toThrow('Unsafe path: Windows drive paths not allowed')
      expect(() => validateMediaPath('C:/x')).toThrow('Unsafe path: Windows drive paths not allowed')
    })

    it('rejects URL schemes', () => {
      expect(() => validateMediaPath('https://x')).toThrow('Unsafe path: URL schemes not allowed')
      expect(() => validateMediaPath('http://example.com/image.jpg')).toThrow('Unsafe path: URL schemes not allowed')
      expect(() => validateMediaPath('data:image/png;base64,...')).toThrow('Unsafe path: URL schemes not allowed')
    })

    it('rejects empty paths', () => {
      expect(() => validateMediaPath('')).toThrow('Unsafe path: empty path not allowed')
      expect(() => validateMediaPath('   ')).toThrow('Unsafe path: empty path not allowed')
    })

    it('rejects paths with control characters', () => {
      expect(() => validateMediaPath('slides/a.jpg\0')).toThrow('Unsafe path: contains null bytes or control characters')
    })
  })
})

