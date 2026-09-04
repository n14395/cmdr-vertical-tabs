# Tabs details

Depth and rationale. `CLAUDE.md` holds the must-knows; the decision rationale, persistence, and closed-tab history live
here.

## Files

- `tab-types.ts`: type definitions (`TabId`, `TabState`, `PersistedTab`, `PersistedPaneTabs`, `UnreachableState`)
- `tab-state-manager.svelte.ts`: reactive state manager (`$state()`); all tab operations + the closed-tab stack. Max 10
  tabs per pane
- `TabBar.svelte`: tab bar UI (always visible, Chrome-style shrinking tabs, pin icons, close buttons, context menu).
  Renders horizontally (top) or vertically (side strip); see § Vertical (side) tabs
- `tab-strip-layout.ts`: pure side-strip layout rules: which panes get a strip from `appearance.sideTabPanes`
  (`paneShowsSideTabs`), the per-pane edge from `appearance.sideTabPlacement` (`stripIsAfterPane`), and the width
  bounds/clamp (see `tab-strip-layout.test.ts`)
- `TabStripResizer.svelte`: the drag handle between a side strip and its file pane (pointer-capture drag, double-click
  resets to the default width)
- `tab-reorder.svelte.ts`: the side strip's drag-to-reorder gesture (`createTabReorderController(deps)`); see § Drag
  reorder in the side strip
- `tab-label.ts`: `deriveTabLabel(path)` (see `tab-label.test.ts`)
- `tab-state-manager.test.ts`: unit tests for the state manager

## Key decisions

- **Tabs sit flush with the window title-bar and the pane's left edge, no spacer on either.** Tab and bar both use
  `--spacing-tab-bar-height`; with matching heights and `align-items: end`, tabs land at the bar's bottom edge with no
  offset, so the active tab's accent band touches the title-bar at every text scale. Left padding is zero so the first
  tab's left edge runs into the pane edge. The right side keeps `--spacing-xxs` for the `+` button. The active tab uses
  `bar-height + 1px` with `margin-bottom: -1px` so it hangs 1 px into the path bar below (covers any 1 px seam).
- **Tabs are square (`border-radius: 0`); the only curve is the concave shoulder pair at the bottom corners.** Its arc
  is `--radius-tab-shoulder`, consumed by the shoulder box's size, its offset, and its mask radius — change the
  variable, not the call sites. The name needs a `--radius-` prefix to satisfy stylelint's `custom-property-pattern`
  (`^(color|spacing|font|radius|shadow|transition|z|sheet|titlebar)-`), which is easy to trip on a local geometry
  variable. `.tab.active::after` uses `border-radius: inherit`, so the accent band tracks the tab's corners
  automatically if they ever come back.
- **The active tab's accent is a 2px band on the TOP EDGE ONLY, and it clips itself.** `.tab.active::after` is a
  full-tab-sized box (`inset: 0`) repeating the tab's top radii, painting only its first 2px via a `linear-gradient`: a
  background is clipped to the rounded border box for free, so each end sweeps along the curve instead of stopping
  square. It has to clip ITSELF because `.tab.active` runs `overflow: visible` so its shoulder wedges can escape, which
  means no clipping comes from `.tab`. Two things NOT to do: shrinking the box to the band's height and rounding it
  (browsers scale corner radii down to fit a short box, flattening the curve), and using an inset `box-shadow` ring
  (paints all four sides, so accent runs down the tab's edges). `pointer-events: none` keeps the overlay off the label
  and close button.
- **Cold load on tab switch (`{#key activeTabId}`), no warm cache.** Keeping inactive tabs alive means multiple
  FilePanes with active watchers, listing caches, and scroll state; for 20 tabs total that's untenable. Cold load with
  cursor-by-filename restoration is fast enough that the simplicity wins.
- **Clone trick for new tab.** `addTab` inserts to the LEFT without changing `activeTabId`; since `{#key activeTabId}`
  drives recreation, no remount happens. The user sees the new tab instantly while staying put; switching is separate.
- **Middle-clicking a folder row opens it in a BACKGROUND tab**, the browser gesture. `pane-pointer.ts` decides what the
  click means (folders only, `..` included, nothing on a snapshot pane, cursor and selection untouched) and
  `tab-operations.ts::openFolderInNewTab` builds the tab: `addTabAfter` the active one, inheriting its sort + view mode,
  `activeTabId` unmoved, so it's the clone trick facing right and just as remount-free. Repeated clicks queue in click
  order because each lands after the same active tab. At the cap it toasts rather than no-op'ing silently, since the
  gesture is cheap to repeat. Analytics see it as `tab_opened` with `source: 'folder'`.
- **Cursor restored by filename, not index.** The listing may have changed while the tab was inactive (watcher events
  still apply); index-based restoration would point to the wrong file. `findFileIndex` is resilient to
  insertions/deletions.
- **Selection cleared on tab switch.** A v1 simplification; preserving it would need a `Set<number>` per tab plus index
  remapping after re-sort. Not worth it without a concrete need.
- **Sort is per-tab, no global per-column memory.** Users browse different directories with different sort needs
  (Downloads by date, projects by name); per-tab sort avoids surprising column changes on switch.
- **Leading-edge debounce on Ctrl+Tab cycling (50ms).** Each switch is a full FilePane remount; rapid cycling without
  debounce mounts/destroys many panes (flicker, wasted IPC). The debounce fires the first press immediately, batches the
  rest, commits only the final target.
- **Pinned-tab navigation auto-creates a new tab.** Pinning preserves a location; navigating in-place would make pinning
  meaningless. The new tab inherits the target path and appears after the pinned tab. Falls back to in-place only at the
  cap (10) to avoid blocking the user.

## Vertical (side) tabs

`appearance.tabBarPosition = 'side'` (Settings > Appearance > Tabs) turns a pane's bar into a full-height vertical strip
of stacked full-width rows; `appearance.sideTabPanes` picks which panes get one (`'both'`, or `'left'` / `'right'` for
the mixed layout), and `appearance.sideTabPlacement` picks the edge (`'left'` both panes, `'outer'` / `'inner'`
mirrored). All three are read reactively in `DualPaneExplorer`, so switching re-lays-out live with no remount (`{#key}`
is untouched).

- **The horizontal geometry tricks deliberately DON'T port.** Shoulders, the +1px seam overhang, gap absorption, and
  `align-items: end` all exist to merge the active tab with the path bar BELOW it. A side strip has no such neighbor, so
  rows are a plain list: `--radius-sm` corners, gap-separated, accent band on the LEFT edge (same self-clipping
  full-size `::after` box, gradient turned `to right`).
- **Vertical-ness is per PANE, not per window.** `DualPaneExplorer` derives `paneSideTabs` for each side
  (`sideTabs && paneShowsSideTabs(paneId, sideTabPanes)`) and passes it as `TabBar`'s `orientation`, so the mixed mode
  is just one pane answering `false`: that pane renders the ordinary horizontal bar and gets no `TabStripResizer`. The
  strip width stays shared, which costs nothing while only one strip exists.
- **Placement is expressed in CSS, not DOM order.** `DualPaneExplorer`'s `.pane-wrapper.tabs-side` is `row`;
  `.tabs-side-after` is `row-reverse` (strip on the pane's right edge). The mapping pane+placement → before/after is the
  pure `stripIsAfterPane` in `tab-strip-layout.ts`. `row-reverse` keeps `TabStripResizer` adjacent to the strip on both
  sides with a single DOM shape.
- **Width is layout state, not a setting.** One shared px width for both strips, held in the explorer store
  (`sideTabStripWidth`), clamped by `clampTabStripWidth` (100-400, default 180 = the horizontal max tab width),
  persisted to `app-status.json` at drag-END only via `persistTabStripWidth` (same rule and reason as the pane split;
  see `persistence-subscriber.svelte.ts`). `TabStripResizer` flips its drag direction via `stripIsAfter` so dragging
  toward the file list always shrinks the strip.
- The narrow-tab close-button drop (`useInlineSize`, 80px threshold) stays active in vertical mode: a strip dragged near
  its minimum is exactly the too-narrow-for-a-close-button case.
- The tablist carries `aria-orientation="vertical"` in this mode.

## Drag reorder in the side strip

A row can be dragged to a new position in the strip. The gesture lives in `tab-reorder.svelte.ts`
(`createTabReorderController(deps)`), instantiated by `TabBar.svelte`; the bar renders what the controller reports and
forwards a committed move to `onTabReorder`, which `DualPaneExplorer` routes to `tab-operations.ts::reorderTab` →
`tab-state-manager`'s `moveTab` + the usual persist.

- **Pointer events, ❌ never HTML5 drag-and-drop.** Under Tauri's `dragDropEnabled` macOS intercepts drag gestures
  before the WKWebView sees `dragstart` / `dragover` / `drop`, so a `draggable` reorder looks wired up and silently
  never fires. Same reason the file-list drag and the favorites drag are `onmousedown`-based, and the same trap:
  synthetic MCP/test events bypass the OS interception, so "it works under MCP" isn't proof it works with a mouse. Full
  writeup: `../navigation/DETAILS.md` § Editable favorites.
- **Click vs drag is decided by a 4px threshold**, so a plain click still switches tab. Below it, nothing happens and
  the row's `onclick` runs as usual; above it the grabbed row fades and the drop line appears. The click that CLOSES a
  drag is swallowed (`consumeDragClick`), including when the row lands back in its own slot — the press was a grab, not
  a pick. The suppression is one-shot and is also cleared by the next `mousedown`, so a drag whose click never arrives
  (the drop was over a different row, where the browser fires `click` on the shared ancestor instead) can't eat a later
  real click.
- **The index math is the shared `$lib/utils/list-reorder.ts`**, the same helpers the switcher's favorites drag uses:
  the CUE comes from the raw `pointerInsertionSlot()` (a visual gap in `0..length`) and the COMMIT from
  `pointerReorderTarget()` (that slot adjusted for the grabbed row being spliced out first). Driving the cue off the
  move target instead puts the line one row too high on downward drags. The cue is hidden for the two slots that would
  leave the row where it is, which is exactly when the commit answers null.
- **A drop never moves `activeTabId`.** Reordering is arranging, not switching: since `{#key activeTabId}` drives
  FilePane recreation, letting a drag change the active tab would cost a cold listing load for a gesture that only
  rearranged the strip. Dragging an inactive row leaves the pane on the tab the user was reading. (Chrome activates the
  tab you grab; a tab switch is much cheaper there.)
- **`moveTab` splices the live `$state` array in place** rather than reassigning through the manager's setter, so the
  keyed `{#each}` moves the one row instead of re-rendering every tab. It refuses a no-op, an unknown id, and an
  out-of-range index, which is what keeps a no-op drop from persisting or emitting analytics.
- Pinned rows drag like any other: a pin preserves a LOCATION (see § Key decisions), not a position, so there's no
  pinned-tabs-first invariant for a reorder to break. The pin travels with the row.
- Horizontal bars are unchanged — `TabBar` arms the gesture only while `orientation === 'vertical'`. The horizontal
  tab's geometry (negative margins absorbing the gaps, escaping shoulder wedges) has no room for a drop-line cue, and
  the strip is where a list long enough to want rearranging lives.
- The cue is CSS-only: `.is-dragging` (fade + `grabbing` cursor) on the grabbed row, `.is-drop-before` (2px accent inset
  at the top) on the row below the target gap, and `.is-drop-end` (inset at the bottom of the last row) for a drop past
  the end. Inset shadows rather than borders so no row shifts as the line moves.
- Pinned by `tab-reorder.svelte.test.ts` (the gesture), `TabBar.test.ts` § "vertical drag reorder" (the wiring and the
  cue classes), and `tab-state-manager.test.ts` § `moveTab` (the array move).

## Unreachable tabs

When a tab's `resolvePathVolume` call times out during startup restoration, the tab enters an "unreachable" state
(`TabState.unreachable: UnreachableState`). Instead of silently falling back to the default volume, it shows an inline
banner (`VolumeUnreachableBanner.svelte`) with the original path, a "Retry" button, and an "Open home folder" button.
The tab bar shows a small warning icon. Runtime-only (not persisted); volume resolution is re-attempted next startup.

## Context menu

The tab context menu (pin/unpin, close, close others) uses a native Tauri popup via `show_tab_context_menu` IPC.

- **Gotcha: Tauri 2's `Menu::popup()` returns before `on_menu_event` fires.** muda queues the `MenuEvent` through an
  event-loop proxy; the popup's NSEvent tracking loop on macOS consumes the wakeup, so a synchronous `mpsc::channel`
  with timeout always races and loses. Instead, `on_menu_event` emits a `tab-context-action` Tauri event and the
  frontend uses a one-shot listener (`onTabContextAction`) registered before showing the popup. Do NOT try a synchronous
  channel.
- **Gotcha: `getActiveTab` silently fixes stale `activeTabId` by falling back to the first tab.** After closing or
  restoring, `activeTabId` may reference a gone tab; throwing would crash the UI, so auto-correcting keeps the pane
  usable.
- **Gotcha: the tab-bar close button is hidden via a CSS container query at `max-width: 80px`.** Chrome-style shrinking
  tabs can get very narrow; a close button on a 40px tab leaves no room for the label. The container query hides it
  without JS measurement. Middle-click close still works at any width.

## Persistence

Tab state persists via `loadPaneTabs` / `savePaneTabs` in `app-status-store.ts`. Migrates from old scalar keys on first
load.

## Closed-tab history (Cmd+Shift+T)

Per-pane in-memory LIFO stack of recently closed tabs (`closedStack: ClosedTab[]` on `TabManager`). Session-only. Capped
by `fileExplorer.tabs.closedTabHistorySize` (default 10, range 1-50, Advanced settings). When the cap shrinks, both
panes' stacks are trimmed live (oldest first); when the cap is reached on close, the oldest entry is dropped and the
close never refuses.

Each entry stores `{ tab, originalIndex }` where `tab` is a `$state.snapshot` of the closed tab with `unreachable: null`
(runtime-only state isn't restored). Reopening pops the top entry and re-inserts at `min(originalIndex, tabs.length)`,
restoring pin state, sort, view mode, cursor filename, and history. The original tab `id` is kept so consumers see the
same tab return. `closeOtherTabsRecording` pushes closed tabs right-to-left (rightmost first); popping in reverse and
re-inserting at `originalIndex` restores the exact pre-close arrangement.

Search-results snapshot refs follow "transfer on close, release on eviction":

- `closeTabRecording` / `closeOtherTabsRecording` do NOT decrement snapshot refs when pushing onto the stack; the refs
  transfer ownership from the live tab's history to the closed-stack entry, keeping the snapshot alive so a `⌘⇧T` reopen
  restores a usable pane.
- `reopenLastClosedTab` just pops the entry back; refs are still alive, no inc/dec.
- The stack's own eviction (`pushClosed` cap overflow or `trimClosedStack`) is the decrement point: each evicted entry's
  history is walked and every `search-results://` path releases a ref.
- The non-recording `closeTab` / `closeOtherTabs` (tests, programmatic flows) release refs immediately since the close
  isn't recorded anywhere.

Bookkeeping is concentrated in `transferSnapshotRefs(closedTab, 'transfer' | 'release')`, called once at each
transition. See `lib/search/DETAILS.md` § "Snapshot store" for the broader picture.

The Tab menu's "Reopen closed tab" item enables/disables based on the focused pane's stack via the
`set_reopen_closed_tab_enabled` Tauri command (mirrors `update_pin_tab_menu`). Frontend pushes the state after every
close, reopen, and focus change. Empty-stack reopen toasts "No recently closed tabs in this pane."; reopen at the cap
toasts "Tab limit reached" and leaves the stack untouched.

## Double-click empty tab bar to open a new tab

`TabBar.svelte`'s `ondblclick` routes to `onNewTab` when the target isn't inside `.tab`, `.close-btn`, or
`.new-tab-btn`, so the bar's right padding strip and the trailing flex space of `.tab-list` both count as "new tab"
surfaces.

## Narrow tabs drop their close button

A tab whose content box shrinks to 80px or less loses its close button; there isn't room for a label and a button both.

The threshold is measured in JS, not queried in CSS. `TabBar.svelte` puts `useInlineSize`
(`$lib/utils/inline-size-action`) on every `.tab`, keeps the ids that are under the threshold in a `SvelteSet`, and
renders `class:narrow` from it; `.tab.narrow .close-btn { display: none }` does the rest. `useInlineSize` reports the
same content box a size query reads, so the number is the one the old `@container (max-width: 80px)` rule used.

**Why not a container query**: `@container` and `container-type` need Safari 16, and Cmdr's WebKit floor is Safari 15
(macOS 12 Monterey ships 15.0). Old WebKit drops the block whole and in silence, so on the oldest macOS Cmdr supports
every tab kept a close button it had no room for, with nothing to say so. Stylelint now rejects both spellings; see
`apps/desktop/src/lib/utils/DETAILS.md` § `inline-size-action.ts`.

A width of 0 reads as "not measured yet", never as narrow: the observer's first callback lands after the first paint,
and treating it as narrow would blink every close button out and back in on mount. Closing a tab leaves its id in the
set, so an `$effect` prunes ids no longer in `tabs`.
