// App status persistence for paths and focus state

import { load } from '@tauri-apps/plugin-store'
import type { Store } from '@tauri-apps/plugin-store'
import type { SortColumn } from './file-explorer/types'
import { defaultSortOrders } from './file-explorer/types'
import type { PersistedTab, PersistedPaneTabs } from './file-explorer/tabs/tab-types'
import {
  DEFAULT_TAB_STRIP_WIDTH,
  MIN_TAB_STRIP_WIDTH,
  MAX_TAB_STRIP_WIDTH,
} from './file-explorer/tabs/tab-strip-layout'
import { resolveValidPath } from './file-explorer/navigation/path-resolution'
import { resolveStorePath } from './settings/store-path'

const STORE_NAME = 'app-status.json'
const DEFAULT_PATH = '~'
const DEFAULT_VOLUME_ID = 'root'
const DEFAULT_SORT_BY: SortColumn = 'name'

export type ViewMode = 'full' | 'brief'

export interface AppStatus {
  leftPath: string
  rightPath: string
  focusedPane: 'left' | 'right'
  leftViewMode: ViewMode
  rightViewMode: ViewMode
  leftVolumeId: string
  rightVolumeId: string
  leftSortBy: SortColumn
  rightSortBy: SortColumn
  /** Left pane width as percentage (25-75). Default: 50 */
  leftPaneWidthPercent: number
  /** Side (vertical) tab strip width in px (`tab-strip-layout.ts` bounds). Default: 180 */
  sideTabStripWidth: number
  /** Whether the Ask Cmdr rail is open. Default: false */
  askCmdrRailOpen: boolean
  /** Ask Cmdr rail width in px (280-520). Default: 340 */
  askCmdrRailWidth: number
  /**
   * Whether this install has already had its one-shot first-run pane layout decided.
   * Set once and never cleared. See `file-explorer/pane/first-run-layout.ts`.
   */
  firstRunLayoutApplied: boolean
}

const DEFAULT_LEFT_PANE_WIDTH_PERCENT = 50
const DEFAULT_ASK_CMDR_RAIL_WIDTH = 340
const ASK_CMDR_RAIL_MIN_WIDTH = 280
const ASK_CMDR_RAIL_MAX_WIDTH = 520

const DEFAULT_STATUS: AppStatus = {
  leftPath: DEFAULT_PATH,
  rightPath: DEFAULT_PATH,
  focusedPane: 'left',
  leftViewMode: 'brief',
  rightViewMode: 'brief',
  leftVolumeId: DEFAULT_VOLUME_ID,
  rightVolumeId: DEFAULT_VOLUME_ID,
  leftSortBy: DEFAULT_SORT_BY,
  rightSortBy: DEFAULT_SORT_BY,
  leftPaneWidthPercent: DEFAULT_LEFT_PANE_WIDTH_PERCENT,
  sideTabStripWidth: DEFAULT_TAB_STRIP_WIDTH,
  askCmdrRailOpen: false,
  askCmdrRailWidth: DEFAULT_ASK_CMDR_RAIL_WIDTH,
  firstRunLayoutApplied: false,
}

let storeInstance: Store | null = null

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    // Resolve the store path so isolated instances (dev, per-worktree dev, E2E)
    // don't read the real production `app-status.json`. See `settings/store-path.ts`.
    const storePath = await resolveStorePath(STORE_NAME)
    storeInstance = await load(storePath)
  }
  return storeInstance
}

/**
 * Resolves a persisted path, falling back to ~ if nothing exists.
 * Uses resolveValidPath with no timeout (startup paths are local, no hung-mount risk at load time)
 * and the caller's pathExistsFn (which may be mocked in tests).
 */
async function resolvePersistedPath(path: string, pathExistsFn: (p: string) => Promise<boolean>): Promise<string> {
  return (await resolveValidPath(path, { pathExistsFn, timeoutMs: 0 })) ?? DEFAULT_PATH
}

function parseViewMode(raw: unknown): ViewMode {
  return raw === 'full' || raw === 'brief' ? raw : 'full'
}

function parseSortColumn(raw: unknown): SortColumn {
  const validColumns: SortColumn[] = ['name', 'extension', 'size', 'modified', 'created']
  if (typeof raw === 'string' && validColumns.includes(raw as SortColumn)) {
    return raw as SortColumn
  }
  return DEFAULT_SORT_BY
}

function parsePaneWidthPercent(raw: unknown): number {
  if (typeof raw === 'number' && raw >= 25 && raw <= 75) {
    return raw
  }
  return DEFAULT_LEFT_PANE_WIDTH_PERCENT
}

function parseRailWidth(raw: unknown): number {
  if (typeof raw === 'number' && raw >= ASK_CMDR_RAIL_MIN_WIDTH && raw <= ASK_CMDR_RAIL_MAX_WIDTH) {
    return raw
  }
  return DEFAULT_ASK_CMDR_RAIL_WIDTH
}

function parseTabStripWidth(raw: unknown): number {
  if (typeof raw === 'number' && raw >= MIN_TAB_STRIP_WIDTH && raw <= MAX_TAB_STRIP_WIDTH) {
    return raw
  }
  return DEFAULT_TAB_STRIP_WIDTH
}

export async function loadAppStatus(pathExists: (p: string) => Promise<boolean>): Promise<AppStatus> {
  try {
    const store = await getStore()
    const leftPath = ((await store.get('leftPath')) as string) || DEFAULT_PATH
    const rightPath = ((await store.get('rightPath')) as string) || DEFAULT_PATH
    const rawFocusedPane = await store.get('focusedPane')
    const focusedPane: 'left' | 'right' = rawFocusedPane === 'right' ? 'right' : 'left'
    const leftViewMode = parseViewMode(await store.get('leftViewMode'))
    const rightViewMode = parseViewMode(await store.get('rightViewMode'))
    const leftVolumeId = ((await store.get('leftVolumeId')) as string) || DEFAULT_VOLUME_ID
    const rightVolumeId = ((await store.get('rightVolumeId')) as string) || DEFAULT_VOLUME_ID
    const leftSortBy = parseSortColumn(await store.get('leftSortBy'))
    const rightSortBy = parseSortColumn(await store.get('rightSortBy'))
    const leftPaneWidthPercent = parsePaneWidthPercent(await store.get('leftPaneWidthPercent'))
    const sideTabStripWidth = parseTabStripWidth(await store.get('sideTabStripWidth'))
    const askCmdrRailOpen = (await store.get('askCmdrRailOpen')) === true
    const askCmdrRailWidth = parseRailWidth(await store.get('askCmdrRailWidth'))
    const firstRunLayoutApplied = (await store.get('firstRunLayoutApplied')) === true

    // Resolve paths with fallback - skip for virtual 'network' volume
    const resolvedLeftPath = leftVolumeId === 'network' ? leftPath : await resolvePersistedPath(leftPath, pathExists)
    const resolvedRightPath =
      rightVolumeId === 'network' ? rightPath : await resolvePersistedPath(rightPath, pathExists)

    return {
      leftPath: resolvedLeftPath,
      rightPath: resolvedRightPath,
      focusedPane,
      leftViewMode,
      rightViewMode,
      leftVolumeId,
      rightVolumeId,
      leftSortBy,
      rightSortBy,
      leftPaneWidthPercent,
      sideTabStripWidth,
      askCmdrRailOpen,
      askCmdrRailWidth,
      firstRunLayoutApplied,
    }
  } catch {
    // If store fails, return defaults
    return DEFAULT_STATUS
  }
}

const SAVE_DEBOUNCE_MS = 200
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Partial<AppStatus> | null = null

/** Debounced save: merges with pending writes and flushes after 200ms of inactivity. */
export function saveAppStatus(status: Partial<AppStatus>): void {
  pendingSave = { ...pendingSave, ...status }

  if (saveDebounceTimer !== null) {
    clearTimeout(saveDebounceTimer)
  }

  saveDebounceTimer = setTimeout(() => {
    const toSave = pendingSave
    pendingSave = null
    saveDebounceTimer = null
    if (toSave) {
      void doSaveAppStatus(toSave)
    }
  }, SAVE_DEBOUNCE_MS)
}

/**
 * Writes the keys the caller actually set, then saves once.
 *
 * Key-driven rather than a branch per field: `DEFAULT_STATUS` already names
 * every persisted key, so walking it keeps the write set and the load set from
 * drifting (a new `AppStatus` field is persisted the moment it has a default,
 * with no save branch to forget), and it retires a chain of identical
 * `if (status.x !== undefined)` arms that tripped the complexity limit as it
 * grew. A key the caller left out stays untouched on disk.
 */
async function doSaveAppStatus(status: Partial<AppStatus>): Promise<void> {
  try {
    const store = await getStore()
    for (const key of Object.keys(DEFAULT_STATUS) as (keyof AppStatus)[]) {
      const value = status[key]
      if (value !== undefined) await store.set(key, value)
    }
    await store.save()
  } catch {
    // Silently fail - persistence is nice-to-have
  }
}

/**
 * Writes immediately instead of after the 200 ms debounce, and resolves once the file is
 * on disk. For state whose loss would change behavior on the next launch rather than just
 * lose a nicety: the first-run layout marker is written during startup, which is followed
 * by plenty of things that can quit the app.
 */
export async function saveAppStatusNow(status: Partial<AppStatus>): Promise<void> {
  await doSaveAppStatus(status)
}

/**
 * Keys whose presence proves a pane was navigated in some earlier run. Both SIDES are
 * listed because nav-state persists per pane (`persistence-subscriber.svelte.ts` runs one
 * effect per side), so someone who only ever moved their right pane has no left keys at
 * all. The `*Tabs` keys are what a current install writes; the scalar `*Path` keys are the
 * pre-tabs shape a long-untouched install may still be the only carrier of.
 */
const PANE_STATE_KEYS = ['leftTabs', 'rightTabs', 'leftPath', 'rightPath'] as const

/**
 * Whether `app-status.json` already carries pane state, meaning this install has run
 * before. KEY PRESENCE is the signal, never tab content: a user who left an empty tab
 * list still has a layout of their own.
 *
 * Reads the store directly rather than going through `loadAppStatus`, which fills in
 * defaults and so can't tell "saved the home folder" from "never saved anything".
 * An unreadable store answers `true`: assuming a prior install only skips a nicety,
 * while assuming a fresh one would overwrite somebody's real layout.
 */
export async function hasPersistedPaneState(): Promise<boolean> {
  try {
    const store = await getStore()
    for (const key of PANE_STATE_KEYS) {
      if (await store.has(key)) return true
    }
    return false
  } catch {
    return true
  }
}

/** Map of volumeId -> last used path for that volume */
export type VolumePathMap = Record<string, string>

function isValidPathMap(value: unknown): value is VolumePathMap {
  if (typeof value !== 'object' || value === null) return false
  return Object.entries(value).every(([k, v]) => typeof k === 'string' && typeof v === 'string')
}

/**
 * Gets the last used path for a specific volume.
 * Returns undefined if no path is stored.
 */
export async function getLastUsedPathForVolume(volumeId: string): Promise<string | undefined> {
  try {
    const store = await getStore()
    const lastUsedPaths = await store.get('lastUsedPaths')
    if (isValidPathMap(lastUsedPaths)) {
      return lastUsedPaths[volumeId]
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Saves the last used path for a specific volume.
 * This is more efficient than loading/saving the full status.
 */
export async function saveLastUsedPathForVolume(volumeId: string, path: string): Promise<void> {
  try {
    const store = await getStore()
    const lastUsedPaths = await store.get('lastUsedPaths')
    const paths: VolumePathMap = isValidPathMap(lastUsedPaths) ? lastUsedPaths : {}
    paths[volumeId] = path
    await store.set('lastUsedPaths', paths)
    await store.save()
  } catch {
    // Silently fail - persistence is nice-to-have
  }
}

// ============================================================================
// Command palette recents persistence
// ============================================================================

export const RECENT_COMMANDS_LIMIT = 10

/**
 * Pure update step for the recents list: move `commandId` to the front,
 * drop any prior occurrence, cap at RECENT_COMMANDS_LIMIT. Exposed for testing.
 */
export function dedupAndPrependRecent(existing: string[], commandId: string): string[] {
  return [commandId, ...existing.filter((id) => id !== commandId)].slice(0, RECENT_COMMANDS_LIMIT)
}

/**
 * Loads the list of recently executed command IDs, most-recent first.
 * Returns an empty array if nothing was saved or parsing fails.
 */
export async function loadRecentCommands(): Promise<string[]> {
  try {
    const store = await getStore()
    const raw = await store.get('recentCommandIds')
    if (!Array.isArray(raw)) return []
    return raw.filter((id): id is string => typeof id === 'string').slice(0, RECENT_COMMANDS_LIMIT)
  } catch {
    return []
  }
}

/**
 * Records a command execution. The given ID is moved to the front; if it was
 * already in the list, the previous entry is dropped (no duplicates). The list
 * is capped at RECENT_COMMANDS_LIMIT entries.
 */
export async function pushRecentCommand(commandId: string): Promise<void> {
  try {
    const store = await getStore()
    const existing = await loadRecentCommands()
    const next = dedupAndPrependRecent(existing, commandId)
    await store.set('recentCommandIds', next)
    await store.save()
  } catch {
    // Silently fail - persistence is nice-to-have
  }
}

/**
 * Loads recents and drops any IDs that aren't in `validIds`. If anything was
 * pruned, the cleaned list is written back. Returns the (possibly pruned) list.
 *
 * Call this on palette open: it self-heals the store against commands that were
 * renamed or removed since the user last used them. Without it, stale IDs would
 * just take up slots in the cap-10 list and reduce the visible recents count.
 */
export async function pruneRecentCommands(validIds: ReadonlySet<string>): Promise<string[]> {
  try {
    const existing = await loadRecentCommands()
    const pruned = existing.filter((id) => validIds.has(id))
    if (pruned.length !== existing.length) {
      const store = await getStore()
      await store.set('recentCommandIds', pruned)
      await store.save()
    }
    return pruned
  } catch {
    return []
  }
}

// ============================================================================
// Settings window section persistence
// ============================================================================

const DEFAULT_SETTINGS_SECTION = ['Appearance', 'Colors and formats']

/**
 * Loads the last viewed settings section.
 * Returns default section if not previously saved.
 */
export async function loadLastSettingsSection(): Promise<string[]> {
  try {
    const store = await getStore()
    const section = await store.get('lastSettingsSection')
    if (Array.isArray(section) && section.every((s): s is string => typeof s === 'string')) {
      return section
    }
    return DEFAULT_SETTINGS_SECTION
  } catch {
    return DEFAULT_SETTINGS_SECTION
  }
}

/**
 * Saves the current settings section for next time.
 */
export async function saveLastSettingsSection(section: string[]): Promise<void> {
  try {
    const store = await getStore()
    await store.set('lastSettingsSection', section)
    await store.save()
  } catch {
    // Silently fail
  }
}

// ============================================================================
// Tab persistence
// ============================================================================

function isValidPersistedTab(raw: unknown): raw is PersistedTab {
  if (typeof raw !== 'object' || raw === null) return false
  const obj = raw as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.path === 'string' &&
    typeof obj.volumeId === 'string' &&
    parseSortColumn(obj.sortBy) === obj.sortBy &&
    (obj.sortOrder === 'ascending' || obj.sortOrder === 'descending') &&
    (obj.viewMode === 'full' || obj.viewMode === 'brief') &&
    typeof obj.pinned === 'boolean'
  )
}

function isValidPersistedPaneTabs(raw: unknown): raw is PersistedPaneTabs {
  if (typeof raw !== 'object' || raw === null) return false
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.tabs) || typeof obj.activeTabId !== 'string') return false
  return obj.tabs.length > 0 && obj.tabs.every(isValidPersistedTab)
}

/**
 * Loads persisted tab state for a pane side.
 * Falls back to migration from old scalar keys if no tab data exists.
 */
export async function loadPaneTabs(
  side: 'left' | 'right',
  pathExistsFn: (p: string) => Promise<boolean>,
): Promise<PersistedPaneTabs> {
  try {
    const store = await getStore()
    const key = `${side}Tabs`
    const raw = await store.get(key)

    if (isValidPersistedPaneTabs(raw)) {
      // Validate paths exist, fall back for any that don't
      const validatedTabs = await Promise.all(
        raw.tabs.map(async (tab) => {
          if (tab.volumeId === 'network') return tab
          const resolvedPath = await resolvePersistedPath(tab.path, pathExistsFn)
          return { ...tab, path: resolvedPath }
        }),
      )
      return { tabs: validatedTabs, activeTabId: raw.activeTabId }
    }

    // TODO(2026-04-01): remove migration
    // Migration from old scalar keys
    const path = ((await store.get(`${side}Path`)) as string) || DEFAULT_PATH
    const volumeId = ((await store.get(`${side}VolumeId`)) as string) || DEFAULT_VOLUME_ID
    const sortBy = parseSortColumn(await store.get(`${side}SortBy`))
    const viewMode = parseViewMode(await store.get(`${side}ViewMode`))
    const resolvedPath = volumeId === 'network' ? path : await resolvePersistedPath(path, pathExistsFn)

    const tab: PersistedTab = {
      id: crypto.randomUUID(),
      path: resolvedPath,
      volumeId,
      sortBy,
      sortOrder: defaultSortOrders[sortBy],
      viewMode,
      pinned: false,
    }

    return { tabs: [tab], activeTabId: tab.id }
  } catch {
    const id = crypto.randomUUID()
    return {
      tabs: [
        {
          id,
          path: DEFAULT_PATH,
          volumeId: DEFAULT_VOLUME_ID,
          sortBy: DEFAULT_SORT_BY,
          sortOrder: defaultSortOrders[DEFAULT_SORT_BY],
          viewMode: 'full',
          pinned: false,
        },
      ],
      activeTabId: id,
    }
  }
}

/** Saves tab state for a pane side. */
export async function savePaneTabs(side: 'left' | 'right', paneTabs: PersistedPaneTabs): Promise<void> {
  try {
    const store = await getStore()
    await store.set(`${side}Tabs`, paneTabs)
    await store.save()
  } catch {
    // Silently fail
  }
}
