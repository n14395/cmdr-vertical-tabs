import { describe, it, expect } from 'vitest'
import {
  clampTabStripWidth,
  paneShowsSideTabs,
  stripIsAfterPane,
  DEFAULT_TAB_STRIP_WIDTH,
  MIN_TAB_STRIP_WIDTH,
  MAX_TAB_STRIP_WIDTH,
  maxTabsForPane,
} from './tab-strip-layout'
import { MAX_TABS_PER_PANE, MAX_TABS_PER_PANE_SIDE } from './tab-state-manager.svelte'

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

describe('paneShowsSideTabs', () => {
  it("gives both panes a strip for 'both'", () => {
    expect(paneShowsSideTabs('left', 'both')).toBe(true)
    expect(paneShowsSideTabs('right', 'both')).toBe(true)
  })

  it('gives only the named pane a strip in the mixed modes', () => {
    expect(paneShowsSideTabs('left', 'left')).toBe(true)
    expect(paneShowsSideTabs('right', 'left')).toBe(false)
    expect(paneShowsSideTabs('left', 'right')).toBe(false)
    expect(paneShowsSideTabs('right', 'right')).toBe(true)
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

describe('maxTabsForPane', () => {
  it('gives a pane on the horizontal bar the smaller cap', () => {
    expect(maxTabsForPane('left', 'top', 'both')).toBe(MAX_TABS_PER_PANE)
    expect(maxTabsForPane('right', 'top', 'both')).toBe(MAX_TABS_PER_PANE)
  })

  it('gives a pane showing the side strip the larger cap', () => {
    expect(maxTabsForPane('left', 'side', 'both')).toBe(MAX_TABS_PER_PANE_SIDE)
    expect(maxTabsForPane('right', 'side', 'both')).toBe(MAX_TABS_PER_PANE_SIDE)
  })

  it('caps the two panes differently in mixed mode', () => {
    // Only the left pane goes vertical, so only it earns the bigger cap.
    expect(maxTabsForPane('left', 'side', 'left')).toBe(MAX_TABS_PER_PANE_SIDE)
    expect(maxTabsForPane('right', 'side', 'left')).toBe(MAX_TABS_PER_PANE)
  })

  it("ignores sideTabPanes entirely while the bar is on top", () => {
    // `sideTabPanes` is only consulted for 'side'; a stale 'left' must not leak
    // the bigger cap into a horizontal pane.
    expect(maxTabsForPane('left', 'top', 'left')).toBe(MAX_TABS_PER_PANE)
  })
})
