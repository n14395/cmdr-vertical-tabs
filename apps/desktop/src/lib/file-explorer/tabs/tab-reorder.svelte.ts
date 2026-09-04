/**
 * Pointer-drag reorder for the vertical tab strip: the scratch state behind grabbing a row,
 * the drop-line cue, and the commit. Lives beside `TabBar.svelte` rather than inside it so the
 * click-vs-drag logic is unit-testable without mounting the bar.
 *
 * The index math is the shared `$lib/utils/list-reorder` (same helpers the switcher's Favorites
 * section drags with); this file owns only the gesture and the DOM measurement.
 *
 * **Pointer events, not HTML5 drag-and-drop.** Under Tauri's `dragDropEnabled` macOS intercepts
 * drag gestures before the WKWebView sees `dragstart` / `dragover` / `drop`, so a `draggable`
 * reorder looks wired up and never fires. Same reason the file-list drag and the favorites drag
 * are `onmousedown`-based. Synthetic MCP/test events bypass the interception, so "it works under
 * MCP" is not proof it works with a real mouse.
 */

import { pointerInsertionSlot, pointerReorderTarget } from '$lib/utils/list-reorder'
import type { TabId, TabState } from './tab-types'

/** Below this many pixels of pointer travel, a mouseup is a plain click (switch tab), not a drag. */
const DRAG_THRESHOLD_PX = 4

export interface TabReorderDeps {
  /** The strip's tabs, in display order. */
  getTabs: () => TabState[]
  /** The `.tab-list` element, used to measure the rows a drag is passing over. */
  getListRef: () => HTMLElement | undefined
  /** Commits a real move: put `tabId` at `toIndex`. Never called for a no-op drop. */
  onReorder: (tabId: TabId, toIndex: number) => void
}

export interface TabReorderController {
  /** The grabbed tab, once the drag threshold is crossed (null before that, and between drags). */
  get draggingTabId(): TabId | null
  /**
   * The raw insertion slot the drop line marks (`0..tabs.length`; slot `k` = the gap above row
   * `k`), or null when the drop wouldn't move the tab. Cue-only — the commit re-derives its own
   * target from the drop position.
   */
  get dropSlot(): number | null
  /** Arms a drag from a row's `mousedown`. Ignores anything but the primary button. */
  handleMouseDown: (tabId: TabId, event: MouseEvent) => void
  /**
   * True exactly once, for the `click` that follows a completed drag, so the row doesn't ALSO
   * switch tab when the user drops it back where it started. Cleared by the read and by the next
   * `mousedown`, so a drag whose click never lands (the drop was over a different row) can't
   * swallow a later real click.
   */
  consumeDragClick: () => boolean
  /** Drops any in-flight window listeners. Call from the component's `onDestroy`. */
  destroy: () => void
}

export function createTabReorderController(deps: TabReorderDeps): TabReorderController {
  let draggingTabId = $state<TabId | null>(null)
  let dropSlot = $state<number | null>(null)

  // Set once the threshold is crossed; before that a mouseup is a plain click.
  let dragActive = false
  let dragStartY = 0
  let pendingTabId: TabId | null = null
  let suppressClick = false

  /** Vertical midpoints of each tab row in list order, for the shared reorder math. */
  function rowMidpoints(): number[] {
    const root = deps.getListRef()
    if (!root) return []
    return deps.getTabs().map((tab) => {
      const el = root.querySelector(`.tab[data-tab-id="${CSS.escape(tab.id)}"]`)
      if (!el) return Number.POSITIVE_INFINITY
      const rect = el.getBoundingClientRect()
      return rect.top + rect.height / 2
    })
  }

  function handleMouseDown(tabId: TabId, event: MouseEvent) {
    if (event.button !== 0) return
    // A fresh press ends the previous gesture's click suppression, whether or not
    // that click ever arrived.
    suppressClick = false
    pendingTabId = tabId
    dragStartY = event.clientY
    dragActive = false
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  function handleMouseMove(event: MouseEvent) {
    const grabbed = pendingTabId
    if (grabbed === null) return
    if (!dragActive) {
      if (Math.abs(event.clientY - dragStartY) < DRAG_THRESHOLD_PX) return
      dragActive = true
      draggingTabId = grabbed
    }
    const from = deps.getTabs().findIndex((tab) => tab.id === grabbed)
    if (from < 0) return
    // The cue follows the RAW insertion slot (the visual gap), not the move target: dropping at
    // slot `from` or `from + 1` leaves the tab where it is, so the line hides for both — which is
    // exactly when the drop's `pointerReorderTarget` answers null.
    const slot = pointerInsertionSlot(rowMidpoints(), event.clientY)
    dropSlot = slot === from || slot === from + 1 ? null : slot
  }

  function handleMouseUp(event: MouseEvent) {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    const grabbed = pendingTabId
    const wasDragging = dragActive
    endDrag()
    if (grabbed === null || !wasDragging) return
    // A completed drag owns its trailing click, even when the tab lands back in its
    // original slot: the press was a grab, not a pick.
    suppressClick = true
    const from = deps.getTabs().findIndex((tab) => tab.id === grabbed)
    if (from < 0) return
    const to = pointerReorderTarget(rowMidpoints(), event.clientY, from)
    if (to === null) return
    deps.onReorder(grabbed, to)
  }

  function endDrag() {
    draggingTabId = null
    dropSlot = null
    dragActive = false
    dragStartY = 0
    pendingTabId = null
  }

  function consumeDragClick(): boolean {
    const suppressed = suppressClick
    suppressClick = false
    return suppressed
  }

  function destroy() {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }

  return {
    get draggingTabId() {
      return draggingTabId
    },
    get dropSlot() {
      return dropSlot
    },
    handleMouseDown,
    consumeDragClick,
    destroy,
  }
}
