/**
 * Pure layout rules for the side (vertical) tab strip: which pane edge each
 * strip sits on per `appearance.sideTabPlacement`, and the width bounds the
 * user-resizable strip is clamped to. UI in `TabBar.svelte` (vertical mode) +
 * `TabStripResizer.svelte`; wiring in `pane/DualPaneExplorer.svelte`.
 */

import type { SideTabPanes, SideTabPlacement, TabBarPosition } from '$lib/settings'
import { MAX_TABS_PER_PANE, MAX_TABS_PER_PANE_SIDE } from './tab-state-manager.svelte'

/** Default side tab strip width in px, matching the horizontal mode's max tab width. */
export const DEFAULT_TAB_STRIP_WIDTH = 180

/** Narrowest the strip can be dragged, in px. Labels truncate; the close button drops below ~80px of content. */
export const MIN_TAB_STRIP_WIDTH = 100

/** Widest the strip can be dragged, in px. */
export const MAX_TAB_STRIP_WIDTH = 400

/** Clamps a dragged or persisted strip width into the allowed range. */
export function clampTabStripWidth(px: number): number {
  return Math.max(MIN_TAB_STRIP_WIDTH, Math.min(MAX_TAB_STRIP_WIDTH, px))
}

/**
 * Whether a pane shows a side tab strip at all, for the mixed mode where only
 * one pane goes vertical (`appearance.sideTabPanes`) and the other keeps its
 * horizontal bar. Only consulted while `appearance.tabBarPosition` is `'side'`.
 */
export function paneShowsSideTabs(paneId: 'left' | 'right', panes: SideTabPanes): boolean {
  return panes === 'both' || panes === paneId
}

/**
 * How many tabs a pane may hold, which depends on where that pane's tabs render:
 * the scrolling side strip takes far more than the horizontal bar, where every
 * extra tab shrinks the rest. Per-pane rather than global on purpose — in mixed
 * mode (`appearance.sideTabPanes` of `'left'` / `'right'`) one pane is vertical
 * while the other keeps its horizontal bar, so the two caps genuinely differ.
 */
export function maxTabsForPane(paneId: 'left' | 'right', position: TabBarPosition, panes: SideTabPanes): number {
  const showsSideStrip = position === 'side' && paneShowsSideTabs(paneId, panes)
  return showsSideStrip ? MAX_TABS_PER_PANE_SIDE : MAX_TABS_PER_PANE
}

/**
 * Whether a pane's side tab strip sits AFTER the file list (on the pane's right
 * edge) for the given placement. `'left'` keeps both strips before their pane;
 * `'outer'` flips the right pane's strip to the window edge; `'inner'` flips the
 * left pane's strip so both strips meet at the pane divider.
 */
export function stripIsAfterPane(paneId: 'left' | 'right', placement: SideTabPlacement): boolean {
  switch (placement) {
    case 'left':
      return false
    case 'outer':
      return paneId === 'right'
    case 'inner':
      return paneId === 'left'
  }
}
