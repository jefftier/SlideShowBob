// Tests for metadata.json validation utilities

import { describe, it, expect } from 'vitest'
import { validateMetadataMap } from './metadataValidation'

describe('validateMetadataMap', () => {
  it('parses a well-formed metadata map', () => {
    const input = {
      'abc123.jpg': {
        subreddit: 'pics',
        author: 'someuser',
        title: 'A cool sunset',
        postId: 'abc123',
        permalink: 'https://www.reddit.com/r/pics/comments/abc123/a_cool_sunset/',
        createdUtc: 1700000000,
        score: 42,
        nsfw: false,
        sourceType: 'subreddit',
        sourceName: 'pics',
        mediaType: 'image',
        galleryIndex: null,
        sourceUrl: 'https://i.redd.it/abc123.jpg',
      },
    }
    const result = validateMetadataMap(input)
    expect(result['abc123.jpg']).toBeDefined()
    expect(result['abc123.jpg'].subreddit).toBe('pics')
    expect(result['abc123.jpg'].score).toBe(42)
    expect(result['abc123.jpg'].nsfw).toBe(false)
    // null galleryIndex should be dropped, not kept as null
    expect(result['abc123.jpg'].galleryIndex).toBeUndefined()
  })

  it('throws if top-level data is not an object', () => {
    expect(() => validateMetadataMap([])).toThrow()
    expect(() => validateMetadataMap('nope')).toThrow()
    expect(() => validateMetadataMap(null)).toThrow()
  })

  it('skips entries that are not objects', () => {
    const input = { 'a.jpg': 'not an object', 'b.jpg': { title: 'ok' } }
    const result = validateMetadataMap(input)
    expect(result['a.jpg']).toBeUndefined()
    expect(result['b.jpg']).toEqual({ title: 'ok' })
  })

  it('drops known fields with the wrong type instead of throwing', () => {
    const input = {
      'a.jpg': { score: 'not a number', title: 42, nsfw: 'true' },
    }
    const result = validateMetadataMap(input)
    expect(result['a.jpg'].score).toBeUndefined()
    expect(result['a.jpg'].title).toBeUndefined()
    expect(result['a.jpg'].nsfw).toBeUndefined()
  })

  it('preserves unknown primitive fields for forward compatibility', () => {
    const input = { 'a.jpg': { title: 'ok', futureField: 'some value', futureNum: 7 } }
    const result = validateMetadataMap(input)
    expect(result['a.jpg'].futureField).toBe('some value')
    expect(result['a.jpg'].futureNum).toBe(7)
  })

  it('drops unknown object/array fields (not safe to render inline)', () => {
    const input = { 'a.jpg': { title: 'ok', nested: { x: 1 }, list: [1, 2, 3] } }
    const result = validateMetadataMap(input)
    expect(result['a.jpg'].nested).toBeUndefined()
    expect(result['a.jpg'].list).toBeUndefined()
    expect(result['a.jpg'].title).toBe('ok')
  })

  it('skips entries with empty/whitespace-only file name keys', () => {
    const input = { '': { title: 'ok' }, '   ': { title: 'ok2' }, 'valid.jpg': { title: 'ok3' } }
    const result = validateMetadataMap(input)
    expect(Object.keys(result)).toEqual(['valid.jpg'])
  })

  it('handles an empty metadata map', () => {
    expect(validateMetadataMap({})).toEqual({})
  })
})
