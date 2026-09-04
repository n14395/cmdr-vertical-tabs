/**
 * Keeps both panes inside the tab cap when `appearance.tabBarPosition` moves
 * back to `'top'`, where far fewer tabs fit than on the side strip.
 *
 * That move is destructive — tabs have to close — so this asks first with the
 * exact count and reverts the setting when the user declines. The revert is why
 * the check lives on a setting SUBSCRIPTION rather than in the settings window:
 * the tab managers are main-window state, so the settings window can't count what
 * a switch would cost. Declining re-emits `'side'`, which this same subscriber
 * ignores (it only acts on `'top'`), so there's no loop.
 *
 * Wired from `DualPaneExplorer.svelte`, which owns the two tab managers; the
 * per-pane counting and closing live in `tab-operations.ts`.
 */

import { onSpecificSettingChange, setSetting } from '$lib/settings'
import { confirmDialog } from '$lib/utils/confirm-dialog'
import { tString } from '$lib/intl/messages.svelte'
import { formatInteger } from '$lib/intl/number-format'
import { countTabsOverHorizontalCap, trimPaneToHorizontalCap } from './tab-operations'
import type { TabManager } from '../tabs/tab-state-manager.svelte'

const PANES = ['left', 'right'] as const

export interface TabCapSyncDeps {
  getTabMgr: (pane: 'left' | 'right') => TabManager
  /** The closed-tab stack's size cap, so trimmed tabs stay reopenable. */
  getClosedTabsCap: () => number
}

/**
 * Subscribes to the tab-bar-position setting. Returns the unsubscribe, for the
 * caller's `onMount` cleanup.
 */
export function createTabCapSync(deps: TabCapSyncDeps): () => void {
  return onSpecificSettingChange('appearance.tabBarPosition', (position) => {
    if (position !== 'top') return
    void enforceHorizontalCap(deps)
  })
}

/**
 * Counts what the move would close across both panes, confirms, then trims. A
 * pane that already fits contributes nothing, so the common case (few tabs open)
 * never shows a dialog.
 */
async function enforceHorizontalCap(deps: TabCapSyncDeps): Promise<void> {
  const total = PANES.reduce((sum, pane) => sum + countTabsOverHorizontalCap(pane, deps.getTabMgr), 0)
  if (total === 0) return

  const confirmed = await confirmDialog(
    tString('fileExplorer.tabs.horizontalCapConfirm', { count: total, countText: formatInteger(total) }),
    tString('fileExplorer.tabs.horizontalCapTitle'),
  )
  if (!confirmed) {
    // The user wants the tabs, and they only fit on the side strip: put the
    // setting back rather than closing anything.
    setSetting('appearance.tabBarPosition', 'side')
    return
  }

  for (const pane of PANES) {
    trimPaneToHorizontalCap(pane, deps.getTabMgr, deps.getClosedTabsCap)
  }
}
