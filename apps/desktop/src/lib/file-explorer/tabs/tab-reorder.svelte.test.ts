/**
 * Unit tests for the side strip's pointer-drag reorder controller.
 *
 * The gesture is the interesting part (click-vs-drag, the drop-line slot, which click belongs to
 * the drag); the index math it stands on is pinned separately by `$lib/utils/list-reorder`'s tests.
 * The factory uses runes, hence the `.svelte.test.ts` suffix and the `$effect.root` wrapper.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { createTabReorderController } from './tab-reorder.svelte'
import type { TabState } from './tab-types'

function makeTab(id: string): TabState {
  return {
    id,
    path: `/Users/test/${id}`,
    volumeId: 'root',
    history: { stack: [{ volumeId: 'root', path: `/Users/test/${id}` }], currentIndex: 0 },
    sortBy: 'name',
    sortOrder: 'ascending',
    viewMode: 'full',
    pinned: false,
    cursorFilename: null,
    unreachable: null,
  }
}

/** A `.tab-list` holding one `.tab[data-tab-id]` per tab, each row's `getBoundingClientRect`
 *  stubbed to a 20px slot stacked from y=0 (midpoints 10, 30, 50, …) so the drag math is
 *  deterministic in a DOM with no layout engine. */
function buildList(tabs: TabState[]): HTMLDivElement {
  const root = document.createElement('div')
  root.className = 'tab-list'
  tabs.forEach((tab, i) => {
    const row = document.createElement('div')
    row.className = 'tab'
    row.setAttribute('data-tab-id', tab.id)
    const top = i * 20
    row.getBoundingClientRect = () => ({
      top,
      height: 20,
      bottom: top + 20,
      left: 0,
      right: 180,
      width: 180,
      x: 0,
      y: top,
      toJSON: () => ({}),
    })
    root.appendChild(row)
  })
  return root
}

describe('tab-reorder controller', () => {
  let dispose: (() => void) | undefined
  let live: ReturnType<typeof createTabReorderController> | undefined
  let tabs: TabState[]
  const onReorder = vi.fn<(tabId: string, toIndex: number) => void>()

  function create(ids: string[]) {
    onReorder.mockClear()
    tabs = ids.map(makeTab)
    const list = buildList(tabs)
    let controller!: ReturnType<typeof createTabReorderController>
    dispose = $effect.root(() => {
      controller = createTabReorderController({
        getTabs: () => tabs,
        getListRef: () => list,
        onReorder,
      })
    })
    live = controller
    return controller
  }

  afterEach(() => {
    // `destroy` first: a test that leaves a drag armed would otherwise keep its window
    // listeners, and the NEXT test's mousemove would drive two controllers at once.
    live?.destroy()
    live = undefined
    dispose?.()
    dispose = undefined
  })

  it('treats a press and release below the threshold as a plain click (no drag, no reorder)', () => {
    const c = create(['t1', 't2', 't3'])
    c.handleMouseDown('t1', new MouseEvent('mousedown', { button: 0, clientY: 10 }))
    // 2px of travel, under DRAG_THRESHOLD_PX.
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 12 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 12 }))

    expect(c.draggingTabId).toBe(null)
    expect(onReorder).not.toHaveBeenCalled()
    // The click that follows still switches tab.
    expect(c.consumeDragClick()).toBe(false)
  })

  it('crossing the threshold starts a drag and dropping past a row commits the move', () => {
    const c = create(['t1', 't2', 't3'])
    c.handleMouseDown('t1', new MouseEvent('mousedown', { button: 0, clientY: 10 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 35 }))
    expect(c.draggingTabId).toBe('t1')

    // y=35 sits below midpoints 10 and 30 → slot 2, which is index 1 once the grabbed row is out.
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 35 }))
    expect(onReorder).toHaveBeenCalledExactlyOnceWith('t1', 1)
    expect(c.draggingTabId).toBe(null)
    expect(c.dropSlot).toBe(null)
  })

  it('marks the drop slot for the cue, and hides it over the gaps that would not move the tab', () => {
    const c = create(['t1', 't2', 't3'])
    c.handleMouseDown('t2', new MouseEvent('mousedown', { button: 0, clientY: 30 }))

    // Below every midpoint (10/30/50) → slot 3: the gap under the last row.
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 80 }))
    expect(c.dropSlot).toBe(3)

    // Above every midpoint → slot 0: the gap above the first row.
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 2 }))
    expect(c.dropSlot).toBe(0)

    // Back over its own band: slots 1 and 2 both leave t2 where it is, so no cue.
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 25 }))
    expect(c.dropSlot).toBe(null)
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 45 }))
    expect(c.dropSlot).toBe(null)
  })

  it('swallows the click of a drag that lands back in place, so the tab is not also switched to', () => {
    const c = create(['t1', 't2', 't3'])
    c.handleMouseDown('t3', new MouseEvent('mousedown', { button: 0, clientY: 50 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 60 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 55 }))

    expect(onReorder).not.toHaveBeenCalled()
    expect(c.consumeDragClick()).toBe(true)
    // One-shot: the next click is a real one again.
    expect(c.consumeDragClick()).toBe(false)
  })

  it('drops a stale suppression on the next press, so a swallowed click cannot leak into a later one', () => {
    const c = create(['t1', 't2'])
    c.handleMouseDown('t1', new MouseEvent('mousedown', { button: 0, clientY: 10 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 40 }))
    // A drop over another row leaves no click behind for the grabbed tab to consume.
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 40 }))

    c.handleMouseDown('t2', new MouseEvent('mousedown', { button: 0, clientY: 30 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientY: 30 }))
    expect(c.consumeDragClick()).toBe(false)
  })

  it('ignores a non-primary button', () => {
    const c = create(['t1', 't2'])
    c.handleMouseDown('t1', new MouseEvent('mousedown', { button: 1, clientY: 10 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 60 }))
    expect(c.draggingTabId).toBe(null)
  })

  it('destroy() removes the in-flight window listeners', () => {
    const c = create(['t1', 't2'])
    c.handleMouseDown('t1', new MouseEvent('mousedown', { button: 0, clientY: 10 }))
    c.destroy()
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 60 }))
    expect(c.draggingTabId).toBe(null)
  })
})
