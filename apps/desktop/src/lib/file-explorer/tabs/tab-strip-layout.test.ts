import { describe, it, expect } from 'vitest'
import {
  clampTabStripWidth,
  stripIsAfterPane,
  DEFAULT_TAB_STRIP_WIDTH,
  MIN_TAB_STRIP_WIDTH,
  MAX_TAB_STRIP_WIDTH,
} from './tab-strip-layout'

describe('clampTabStripWidth', () => {
  it('passes through in-range widths', () => {
    expect(clampTabStripWidth(DEFAULT_TAB_STRIP_WIDTH)).toBe(DEFAULT_TAB_STRIP_WIDTH)
    expect(clampTabStripWidth(MIN_TAB_STRIP_WIDTH)).toBe(MIN_TAB_STRIP_WIDTH)
    expect(clampTabStripWidth(MAX_TAB_STRIP_WIDTH)).toBe(MAX_TAB_STRIP_WIDTH)
  })

  it('clamps below the minimum', () => {
    expect(clampTabStripWidth(0)).toBe(MIN_TAB_STRIP_WIDTH)
    expect(clampTabStripWidth(-50)).toBe(MIN_TAB_STRIP_WIDTH)
  })

  it('clamps above the maximum', () => {
    expect(clampTabStripWidth(10_000)).toBe(MAX_TAB_STRIP_WIDTH)
  })
})

describe('stripIsAfterPane', () => {
  it("keeps both strips before their pane for 'left'", () => {
    expect(stripIsAfterPane('left', 'left')).toBe(false)
    expect(stripIsAfterPane('right', 'left')).toBe(false)
  })

  it("flips only the right pane's strip to the window edge for 'outer'", () => {
    expect(stripIsAfterPane('left', 'outer')).toBe(false)
    expect(stripIsAfterPane('right', 'outer')).toBe(true)
  })

  it("flips only the left pane's strip toward the divider for 'inner'", () => {
    expect(stripIsAfterPane('left', 'inner')).toBe(true)
    expect(stripIsAfterPane('right', 'inner')).toBe(false)
  })
})
