// Feature: toolbar-ui-improvements, Property 1: Text contrast meets WCAG AA threshold
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

// --- WCAG 2.1 Relative Luminance & Contrast Ratio Helpers ---

/** Convert an sRGB channel (0–255) to linear light */
function sRGBtoLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** Relative luminance per WCAG 2.1 (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance) */
function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b)
}

/** WCAG contrast ratio between two luminance values */
function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Composite a semi-transparent foreground RGBA over an opaque background RGB.
 * Uses standard alpha compositing (source-over).
 */
function compositeOver(
  fgR: number, fgG: number, fgB: number, fgA: number,
  bgR: number, bgG: number, bgB: number,
): [number, number, number] {
  return [
    fgR * fgA + bgR * (1 - fgA),
    fgG * fgA + bgG * (1 - fgA),
    fgB * fgA + bgB * (1 - fgA),
  ]
}

// --- Color Palette from src/style.css ---

interface RGBAColor {
  label: string
  r: number
  g: number
  b: number
  a: number
}

// Dark mode backgrounds (semi-transparent, composited over --app-bg #0a0a0a)
const DARK_APP_BG = { r: 10, g: 10, b: 10 } // #0a0a0a

const darkBackgrounds: RGBAColor[] = [
  { label: 'glass-bg (dark)', r: 28, g: 28, b: 30, a: 0.56 },
  { label: 'glass-bg-elevated (dark)', r: 44, g: 44, b: 46, a: 0.88 },
  { label: 'app-bg (dark)', r: 10, g: 10, b: 10, a: 1.0 },
]

// Dark mode text colors (semi-transparent, composited over the effective background)
const darkTextColors: RGBAColor[] = [
  { label: 'text-primary (dark)', r: 255, g: 255, b: 255, a: 0.9 },
  { label: 'text-secondary (dark)', r: 255, g: 255, b: 255, a: 0.6 },
  { label: 'text-tertiary (dark)', r: 255, g: 255, b: 255, a: 0.65 },
]

// Light mode backgrounds (semi-transparent, composited over --app-bg #f5f5f7)
const LIGHT_APP_BG = { r: 245, g: 245, b: 247 } // #f5f5f7

const lightBackgrounds: RGBAColor[] = [
  { label: 'glass-bg (light)', r: 255, g: 255, b: 255, a: 0.56 },
  { label: 'glass-bg-elevated (light)', r: 255, g: 255, b: 255, a: 0.88 },
  { label: 'app-bg (light)', r: 245, g: 245, b: 247, a: 1.0 },
]

// Light mode text colors
const lightTextColors: RGBAColor[] = [
  { label: 'text-primary (light)', r: 0, g: 0, b: 0, a: 0.9 },
  { label: 'text-secondary (light)', r: 0, g: 0, b: 0, a: 0.6 },
  { label: 'text-tertiary (light)', r: 0, g: 0, b: 0, a: 0.65 },
]

// Hardcoded replacement colors used in component CSS (opaque hex values)
const hardcodedTextColors: RGBAColor[] = [
  { label: '#aaa', r: 170, g: 170, b: 170, a: 1.0 },
  { label: '#999', r: 153, g: 153, b: 153, a: 1.0 },
  { label: '#bbb', r: 187, g: 187, b: 187, a: 1.0 },
]

/**
 * Compute the effective opaque RGB of a semi-transparent color composited
 * over a semi-transparent background, which itself is composited over an
 * opaque app background.
 */
function effectiveContrastRatio(
  text: RGBAColor,
  bg: RGBAColor,
  appBg: { r: number; g: number; b: number },
): number {
  // Step 1: composite the background over the app background
  const [bgR, bgG, bgB] = compositeOver(bg.r, bg.g, bg.b, bg.a, appBg.r, appBg.g, appBg.b)
  // Step 2: composite the text over the effective background
  const [fgR, fgG, fgB] = compositeOver(text.r, text.g, text.b, text.a, bgR, bgG, bgB)

  const bgLum = relativeLuminance(bgR, bgG, bgB)
  const fgLum = relativeLuminance(fgR, fgG, fgB)

  return contrastRatio(fgLum, bgLum)
}

// --- Build all valid (text, background, appBg) combinations ---

interface ColorPair {
  textLabel: string
  bgLabel: string
  text: RGBAColor
  bg: RGBAColor
  appBg: { r: number; g: number; b: number }
}

const allPairs: ColorPair[] = []

// Dark mode: CSS variable text colors × dark backgrounds
for (const text of darkTextColors) {
  for (const bg of darkBackgrounds) {
    allPairs.push({ textLabel: text.label, bgLabel: bg.label, text, bg, appBg: DARK_APP_BG })
  }
}

// Light mode: CSS variable text colors × light backgrounds
for (const text of lightTextColors) {
  for (const bg of lightBackgrounds) {
    allPairs.push({ textLabel: text.label, bgLabel: bg.label, text, bg, appBg: LIGHT_APP_BG })
  }
}

// Hardcoded replacement colors against dark backgrounds
for (const text of hardcodedTextColors) {
  for (const bg of darkBackgrounds) {
    allPairs.push({ textLabel: text.label, bgLabel: bg.label, text, bg, appBg: DARK_APP_BG })
  }
}

// --- fast-check arbitrary that picks from the palette ---

const colorPairArb = fc.constantFrom(...allPairs)

// --- Property Test ---

describe('WCAG AA Text Contrast', () => {
  it('Property 1: all app palette text/background pairs meet WCAG AA 4.5:1 contrast ratio', () => {
    fc.assert(
      fc.property(colorPairArb, (pair) => {
        const ratio = effectiveContrastRatio(pair.text, pair.bg, pair.appBg)
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      }),
      { numRuns: 200 }, // well above the 100 minimum, covers all pairs many times
    )
  })
})
