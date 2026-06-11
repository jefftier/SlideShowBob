import { describe, it, expect, beforeEach, vi } from 'vitest'
import { syncUrlToState } from './urlSync'
import { parseUrlParams } from './urlParams'

describe('syncUrlToState', () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Reset URL to a clean state before each test
    window.history.replaceState(null, '', 'http://localhost:3000/')
    replaceStateSpy = vi.spyOn(window.history, 'replaceState')
  })

  describe('uses history.replaceState (not pushState)', () => {
    it('calls replaceState, not pushState', () => {
      const pushStateSpy = vi.spyOn(window.history, 'pushState')
      syncUrlToState({ path: '/photos', files: [] })
      expect(replaceStateSpy).toHaveBeenCalled()
      expect(pushStateSpy).not.toHaveBeenCalled()
    })
  })

  describe('path parameter encoding', () => {
    it('sets path parameter for a simple path', () => {
      syncUrlToState({ path: '/Users/jeff/Pictures', files: [] })
      const url = new URL(window.location.href)
      expect(url.searchParams.get('path')).toBe('/Users/jeff/Pictures')
    })

    it('percent-encodes spaces in path', () => {
      syncUrlToState({ path: '/Users/jeff/Vacation Photos', files: [] })
      const url = new URL(window.location.href)
      expect(url.searchParams.get('path')).toBe('/Users/jeff/Vacation Photos')
      // The raw URL should contain the encoded form
      expect(window.location.search).toContain('Vacation+Photos')
    })

    it('percent-encodes special characters in path', () => {
      syncUrlToState({ path: '/Users/jeff/Photos & Videos', files: [] })
      const url = new URL(window.location.href)
      expect(url.searchParams.get('path')).toBe('/Users/jeff/Photos & Videos')
    })
  })

  describe('file parameter encoding', () => {
    it('sets file parameters for each file', () => {
      syncUrlToState({ path: '/photos', files: ['sunset.jpg', 'beach.png'] })
      const url = new URL(window.location.href)
      expect(url.searchParams.getAll('file')).toEqual(['sunset.jpg', 'beach.png'])
    })

    it('percent-encodes spaces in file names', () => {
      syncUrlToState({ path: '/photos', files: ['my photo.jpg'] })
      const url = new URL(window.location.href)
      expect(url.searchParams.get('file')).toBe('my photo.jpg')
    })

    it('percent-encodes special characters in file names', () => {
      syncUrlToState({ path: '/photos', files: ['photo#1.jpg'] })
      const url = new URL(window.location.href)
      expect(url.searchParams.get('file')).toBe('photo#1.jpg')
    })

    it('preserves file order', () => {
      const files = ['c.jpg', 'a.jpg', 'b.jpg']
      syncUrlToState({ path: '/photos', files })
      const url = new URL(window.location.href)
      expect(url.searchParams.getAll('file')).toEqual(files)
    })
  })

  describe('removes slideshow params when state is empty', () => {
    it('removes path and file params when path is null and files are empty', () => {
      // First, set some params
      syncUrlToState({ path: '/photos', files: ['a.jpg'] })
      expect(new URL(window.location.href).searchParams.has('path')).toBe(true)

      // Then clear them
      syncUrlToState({ path: null, files: [] })
      const url = new URL(window.location.href)
      expect(url.searchParams.has('path')).toBe(false)
      expect(url.searchParams.has('file')).toBe(false)
    })

    it('removes autoplay param when syncing state', () => {
      // Simulate a URL that already has autoplay
      window.history.replaceState(null, '', 'http://localhost:3000/?autoplay=true&path=/photos')

      syncUrlToState({ path: '/photos', files: [] })
      const url = new URL(window.location.href)
      expect(url.searchParams.has('autoplay')).toBe(false)
      expect(url.searchParams.get('path')).toBe('/photos')
    })
  })

  describe('preserves non-slideshow params', () => {
    it('preserves unrelated query params', () => {
      window.history.replaceState(null, '', 'http://localhost:3000/?theme=dark')

      syncUrlToState({ path: '/photos', files: [] })
      const url = new URL(window.location.href)
      expect(url.searchParams.get('theme')).toBe('dark')
      expect(url.searchParams.get('path')).toBe('/photos')
    })
  })

  describe('round-trip with parseUrlParams', () => {
    it('round-trips a simple path', () => {
      syncUrlToState({ path: '/Users/jeff/Pictures', files: [] })
      const parsed = parseUrlParams(window.location.search)
      expect(parsed.path).toBe('/Users/jeff/Pictures')
      expect(parsed.files).toEqual([])
    })

    it('round-trips path with spaces', () => {
      syncUrlToState({ path: '/Users/jeff/Vacation Photos', files: [] })
      const parsed = parseUrlParams(window.location.search)
      expect(parsed.path).toBe('/Users/jeff/Vacation Photos')
    })

    it('round-trips path and files', () => {
      const state = { path: '/photos', files: ['sunset.jpg', 'beach.png'] }
      syncUrlToState(state)
      const parsed = parseUrlParams(window.location.search)
      expect(parsed.path).toBe(state.path)
      expect(parsed.files).toEqual(state.files)
    })

    it('round-trips files with special characters', () => {
      const state = { path: '/photos', files: ['photo (1).jpg', 'café.png'] }
      syncUrlToState(state)
      const parsed = parseUrlParams(window.location.search)
      expect(parsed.path).toBe(state.path)
      expect(parsed.files).toEqual(state.files)
    })
  })
})
