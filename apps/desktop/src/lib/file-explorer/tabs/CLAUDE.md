# Tabs

Per-pane tab system for the dual-pane file explorer. Each pane side (left/right) has an independent tab bar, capped at
10 tabs on the horizontal bar and 50 on the side strip.

## Module map

- **`tab-types.ts`**: `TabId`, `TabState`, `PersistedTab`, `PersistedPaneTabs`, `UnreachableState`
- **`tab-state-manager.svelte.ts`**: Reactive `$state()` manager; all tab ops (add, close, switch, cycle, pin) + the
  closed-tab stack
- **`TabBar.svelte`**: Tab bar UI (always visible, Chrome-style shrinking tabs, pins, close buttons, context menu). Two
  orientations: horizontal (top, default) and vertical (the side strip, per `appearance.tabBarPosition`)
- **`tab-strip-layout.ts`** + **`TabStripResizer.svelte`**: side-strip layout rules (which panes get a strip from
  `appearance.sideTabPanes`, the per-pane edge from `appearance.sideTabPlacement`, width bounds) and the drag handle
  resizing the strip
- **`tab-reorder.svelte.ts`**: the side strip's drag-to-reorder gesture, on the shared `$lib/utils/list-reorder` math
- **`tab-label.ts`**: `deriveTabLabel(path)`, the tab title
- **`tab-analytics.ts`**: the event vocabulary. Emitted from `pane/tab-operations.ts`, ❌ never from the pure state
  manager (unit tests drive it directly).

Architecture, decision rationale, persistence, and closed-tab-history detail: `DETAILS.md`.

## Must-knows

- **Tab switch is a cold load: `{#key activeTabId}` destroys and recreates FilePane, no warm cache.** Inactive tabs hold
  no FilePane, watcher, listing cache, or scroll state. Cursor is restored by filename (`findFileIndex`), not by index,
  because the listing may change while a tab is inactive. Selection is cleared on switch (intentional v1
  simplification).
- **`addTab` inserts to the LEFT without changing `activeTabId`** (the clone trick), so no remount happens and the user
  stays on their current tab; switching to the new tab is a separate explicit action. `addTabAfter` is the same trick
  facing right, for the background open (middle-clicking a folder row); neither moves the active tab.
- **Ctrl+Tab cycling uses a leading-edge debounce (50ms).** It fires the first press immediately, then batches and
  commits only the final target, so rapid cycling doesn't mount/destroy many FilePanes.
- **Pinned-tab navigation auto-creates a new tab instead of navigating in-place** (pinning preserves a location).
  Inherits the target path, appears after the pinned tab; falls back to in-place only at the pane's cap.
- **The cap is PER PANE, ❌ never a bare `MAX_TABS_PER_PANE`.** Mixed mode runs one pane vertical (50) and one
  horizontal (10). Resolve via `maxTabsForPane` / `currentMaxTabsForPane`; every add and reopen takes it as an argument.
- **Moving the bar back to `'top'` closes the overflow, and MUST ask first** (`pane/tab-cap-sync.ts`): pinned and active
  tabs survive, declining reverts to `'side'`, closes are recorded so Cmd+Shift+T undoes them.
- **The tab context menu must use the async event path (`tab-context-action` + a one-shot `onTabContextAction` listener
  registered before the popup), ❌ never a synchronous channel.** `Menu::popup()` returns before `on_menu_event` fires
  and macOS's NSEvent loop eats the wakeup, so an `mpsc::channel` with a timeout always loses.
- **`getActiveTab` silently falls back to the first tab when `activeTabId` is stale** (after close or restore). Throwing
  would crash the UI; auto-correcting keeps the pane usable.
- **Closed-tab history (Cmd+Shift+T) TRANSFERS search-results snapshot refs on close and releases them on eviction.**
  The recording closes keep the refs alive for a reopen; only the stack's own eviction decrements, while the
  non-recording `closeTab` / `closeOtherTabs` release immediately. It all flows through `transferSnapshotRefs`.
- **Side-strip rows reorder by POINTER drag, ❌ never HTML5 `draggable`** (Tauri's `dragDropEnabled` eats
  `dragstart`/`drop`, so it looks wired up and never fires — and synthetic MCP events won't tell you). A drop leaves
  `activeTabId` alone, so rearranging never costs a FilePane remount.
- **`tab-label.ts` special-cases only the MTP scheme**: an `mtp://…` label comes from the within-storage path, so a
  storage root reads "/" rather than the raw storage id. Everything else keeps its basename.

## MCP

- `tab` tool with `action`: `new`, `close`, `close_others`, `activate`, `set_pinned`, `reopen`.
- `tab_id` defaults to active tab for close / close_others / set_pinned; required for activate; unused for new / reopen.
- `close` on the last tab errors instead of closing the window; `close` skips the pinned-tab confirmation; `set_pinned`
  is idempotent; `reopen` is a no-op (fire-and-forget OK reply) when the stack is empty or at the cap.
- Tab list shows in `cmdr://state`. Frontend syncs state via debounced `updatePaneTabs` IPC.
