import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, tick } from 'svelte'
import TabBar from './TabBar.svelte'
import { installLayoutMock } from '$lib/test-layout'
import type { TabState } from './tab-types'

/**
 * A tab too narrow to hold a label AND a close button drops the close button.
 * That used to be a `@container (max-width: 80px)` query, which needs Safari 16;
 * on the Safari 15 that macOS 12 ships, the whole block is dropped silently and
 * every tab keeps a close button that doesn't fit. These tests pin the
 * measured-in-JS replacement at the same threshold.
 */

const noop = () => {}

function makeTab(id: string, path: string): TabState {
  return {
    id,
    path,
    volumeId: 'root',
    history: { stack: [{ volumeId: 'root', path }], currentIndex: 0 },
    sortBy: 'name',
    sortOrder: 'ascending',
    viewMode: 'full',
    pinned: false,
    cursorFilename: null,
    unreachable: null,
  }
}

function mountTabBar(target: HTMLElement) {
  mount(TabBar, {
    target,
    props: {
      tabs: [makeTab('t1', '/Users/test/one'), makeTab('t2', '/Users/test/two')],
      activeTabId: 't1',
      paneId: 'left',
      maxTabs: 10,
      onTabSwitch: noop,
      onTabClose: noop,
      onTabMiddleClick: noop,
      onNewTab: noop,
      onContextMenu: noop,
      onPaneFocus: noop,
      onTabReorder: noop,
    },
  })
}

describe('TabBar narrow tabs', () => {
  let target: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  it('keeps the close button on a comfortably wide tab', async () => {
    installLayoutMock({ '.tab': { clientWidth: 160 } })
    mountTabBar(target)
    await tick()

    expect(target.querySelectorAll('.tab.narrow')).toHaveLength(0)
  })

  it('marks a tab narrow once it is down to the threshold', async () => {
    const layout = installLayoutMock({ '.tab': { clientWidth: 160 } })
    mountTabBar(target)
    await tick()

    layout.resize('.tab', { clientWidth: 80 })
    await tick()

    expect(target.querySelectorAll('.tab.narrow')).toHaveLength(2)
  })

  it('gives the close button back when the tab grows again', async () => {
    const layout = installLayoutMock({ '.tab': { clientWidth: 40 } })
    mountTabBar(target)
    await tick()
    expect(target.querySelectorAll('.tab.narrow')).toHaveLength(2)

    layout.resize('.tab', { clientWidth: 160 })
    await tick()

    expect(target.querySelectorAll('.tab.narrow')).toHaveLength(0)
  })

  // The observer's first callback lands after the first paint, so an unmeasured
  // tab reads as 0 px wide. Treating that as "narrow" would blink every close
  // button out and back in on mount.
  it('treats an unmeasured tab as wide, not as zero-width', async () => {
    mountTabBar(target)
    await tick()

    expect(target.querySelectorAll('.tab')).toHaveLength(2)
    expect(target.querySelectorAll('.tab.narrow')).toHaveLength(0)
  })
})

/**
 * Vertical (side) mode: the strip announces its orientation on the tablist,
 * takes its width from the `stripWidth` prop, and skips the Chrome-style
 * shoulder wedges (they exist to merge the active tab with the path bar below,
 * a neighbor a side strip doesn't have).
 */
describe('TabBar vertical mode', () => {
  let target: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  function mountWith(orientation: 'horizontal' | 'vertical', stripWidth?: number) {
    mount(TabBar, {
      target,
      props: {
        tabs: [makeTab('t1', '/Users/test/one'), makeTab('t2', '/Users/test/two')],
        activeTabId: 't1',
        paneId: 'left',
        maxTabs: 10,
        orientation,
        stripWidth,
        onTabSwitch: noop,
        onTabClose: noop,
        onTabMiddleClick: noop,
        onNewTab: noop,
        onContextMenu: noop,
        onPaneFocus: noop,
        onTabReorder: noop,
      },
    })
  }

  it('marks the bar and tablist vertical and applies the strip width', async () => {
    mountWith('vertical', 220)
    await tick()

    const bar = target.querySelector('.tab-bar')
    expect(bar?.classList.contains('vertical')).toBe(true)
    expect((bar as HTMLElement).style.width).toBe('220px')
    expect(target.querySelector('[role="tablist"]')?.getAttribute('aria-orientation')).toBe('vertical')
  })

  it('renders no shoulder wedges on the active tab', async () => {
    mountWith('vertical', 220)
    await tick()

    expect(target.querySelectorAll('.tab-shoulder')).toHaveLength(0)
  })

  it('keeps the horizontal default: no vertical class, no width, shoulders present', async () => {
    mountWith('horizontal')
    await tick()

    const bar = target.querySelector('.tab-bar')
    expect(bar?.classList.contains('vertical')).toBe(false)
    expect((bar as HTMLElement).style.width).toBe('')
    expect(target.querySelector('[role="tablist"]')?.getAttribute('aria-orientation')).toBeNull()
    expect(target.querySelectorAll('.tab-shoulder')).toHaveLength(2)
  })
})

/**
 * Drag reorder of the side strip's rows: the wiring between the bar and
 * `tab-reorder.svelte.ts` (which owns the gesture and is unit-tested on its own).
 * Rows are given a 20px-tall stacked geometry, since the test DOM has no layout.
 */
describe('TabBar vertical drag reorder', () => {
  let target: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  function mountStrip(
    orientation: 'horizontal' | 'vertical',
    handlers: { onTabReorder?: (tabId: string, toIndex: number) => void; onTabSwitch?: (tabId: string) => void } = {},
  ) {
    mount(TabBar, {
      target,
      props: {
        tabs: [makeTab('t1', '/Users/test/one'), makeTab('t2', '/Users/test/two'), makeTab('t3', '/Users/test/three')],
        activeTabId: 't1',
        paneId: 'left',
        maxTabs: 10,
        orientation,
        stripWidth: 200,
        onTabSwitch: handlers.onTabSwitch ?? noop,
        onTabClose: noop,
        onTabMiddleClick: noop,
        onNewTab: noop,
        onContextMenu: noop,
        onPaneFocus: noop,
        onTabReorder: handlers.onTabReorder ?? noop,
      },
    })
    // Stack the rows 20px apart from y=0, so midpoints land at 10, 30, 50.
    target.querySelectorAll('.tab').forEach((row, i) => {
      const top = i * 20
      row.getBoundingClientRect = () =>
        ({ top, height: 20, bottom: top + 20, left: 0, right: 200, width: 200, x: 0, y: top }) as DOMRect
    })
  }

  /** The row for a tab id. */
  function row(tabId: string): HTMLElement {
    return target.querySelector(`.tab[data-tab-id="${tabId}"]`) as HTMLElement
  }

  it('drags a row down past its neighbour and reports the new index', async () => {
    const onTabReorder = vi.fn()
    mountStrip('vertical', { onTabReorder })
    await tick()

    row('t1').dispatchEvent(new MouseEvent('mousedown', { button: 0, clientY: 10, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 35 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 35 }))

    expect(onTabReorder).toHaveBeenCalledExactlyOnceWith('t1', 1)
  })

  it('fades the grabbed row and marks the gap it would drop into', async () => {
    mountStrip('vertical')
    await tick()

    row('t1').dispatchEvent(new MouseEvent('mousedown', { button: 0, clientY: 10, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 55 }))
    await tick()

    expect(row('t1').classList.contains('is-dragging')).toBe(true)
    // Below every midpoint (10/30/50) → the gap under the last row.
    expect(row('t3').classList.contains('is-drop-end')).toBe(true)

    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 55 }))
    await tick()
    expect(target.querySelectorAll('.is-dragging, .is-drop-before, .is-drop-end')).toHaveLength(0)
  })

  it('does not switch to the tab the drag started on', async () => {
    const onTabSwitch = vi.fn()
    mountStrip('vertical', { onTabSwitch })
    await tick()

    // Grab the inactive t2, drop it back where it started: a drag, not a pick.
    row('t2').dispatchEvent(new MouseEvent('mousedown', { button: 0, clientY: 30, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 40 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 35 }))
    row('t2').dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true }))

    expect(onTabSwitch).not.toHaveBeenCalled()
  })

  it('still switches on a plain click (no pointer travel)', async () => {
    const onTabSwitch = vi.fn()
    mountStrip('vertical', { onTabSwitch })
    await tick()

    row('t2').dispatchEvent(new MouseEvent('mousedown', { button: 0, clientY: 30, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 30 }))
    row('t2').dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true }))

    expect(onTabSwitch).toHaveBeenCalledExactlyOnceWith('t2')
  })

  it('leaves the horizontal bar click-only: no drag, no reorder', async () => {
    const onTabReorder = vi.fn()
    mountStrip('horizontal', { onTabReorder })
    await tick()

    row('t1').dispatchEvent(new MouseEvent('mousedown', { button: 0, clientY: 10, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 55 }))
    await tick()

    expect(target.querySelectorAll('.is-dragging')).toHaveLength(0)
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 55 }))
    expect(onTabReorder).not.toHaveBeenCalled()
  })
})
