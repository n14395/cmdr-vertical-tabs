# Cmdr - vertical tabs fork

![License](https://img.shields.io/badge/license-BSL--1.1-blue)

This is an **unofficial fork** of [Cmdr](https://github.com/vdavid/cmdr), a fast, keyboard-driven two-pane file manager
for macOS by [David Veszelovszki](https://github.com/vdavid). All the credit for the app belongs to him. This repo just
carries a few changes I wanted for my own use.

**Looking for Cmdr itself? Go to [getcmdr.com](https://getcmdr.com) or
[vdavid/cmdr](https://github.com/vdavid/cmdr).** This fork ships source only, no builds, and it is not affiliated with
or endorsed by the Cmdr project.

## Features added here

- **Vertical tabs.** A per-pane side tab strip as an alternative to the tab bar across the top, with a drag handle to
  resize it, drag-to-reorder rows, and a raised cap of 50 tabs per pane (the horizontal bar stays at 10). Three new
  settings under Appearance › Tabs: `tabBarPosition` (top / side), `sideTabPanes` (both / left / right), and
  `sideTabPlacement` (left / outer / inner).
- **Middle-click gestures.** Middle-click a folder row to open it in a background tab, and middle-click a tab to close
  it, following the browser conventions.
- **Mouse back / forward on macOS at the driver level.** Cmdr already walks pane history from the X1/X2 side buttons
  ([upstream issue #31](https://github.com/vdavid/cmdr/issues/31), shipped in v0.30.0), but that path reads
  `MouseEvent.button` from the DOM. Some macOS mouse drivers, Logi Options+ among them, post a swipe gesture and no
  mouse button at all, so nothing reaches it. This fork adds a native AppKit monitor that catches both shapes.

## Bugs fixed here

- **Every folder drew the home folder's icon.** The generic `dir` icon is sampled from a real folder on disk, and the
  sample was `~`. macOS bakes the home folder's house badge, plus any custom icon assigned to `~`, into the bitmap, so
  the house ended up stamped on roughly 99% of rows. The sample is now a Cmdr-owned empty temp folder.
- **Folders with a Finder custom icon drew the generic folder icon instead.** Custom-icon detection is deliberately kept
  off the bulk-listing hot path, so such a folder keeps the plain `dir` icon id and its real icon lands in the cache
  under a `path:{dir}` key that no entry points at. The frontend looked icons up by id alone, so the custom icon was
  fetched, cached, and then silently thrown away. It now resolves by path first, and leaves user artwork out of the
  Cmdr-gold recolor filter.

I would like all of these to land upstream rather than live here forever. See the pull requests on
[vdavid/cmdr](https://github.com/vdavid/cmdr/pulls).

## Building

Everything else, including dev setup, tooling, and tests, is unchanged from upstream. See
[CONTRIBUTING.md](CONTRIBUTING.md), and run `pnpm check` before committing.

```bash
mise install
cd apps/desktop && pnpm install
pnpm dev
```

## License

Cmdr is **source-available** under the [Business Source License 1.1](LICENSE), © Rymdskottkärra AB. That license is not
an open source license, and it applies to this fork exactly as it applies to the original:

- **Personal use is free.** Install it on as many of your own machines as you like, as long as you are the only user.
- **Any other production use**, whether work, contract, or business, **requires a commercial license** from
  [getcmdr.com/pricing](https://getcmdr.com/pricing).
- The source converts to [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) on the Change Date in `LICENSE`.

The BSL grants the right to copy, modify, and redistribute the source, which is what this fork does. It grants no rights
in the licensor's trademarks or logos, so this repo distributes no builds and claims no rights to the Cmdr name or icon.

Please read [LICENSE](LICENSE) yourself rather than relying on this summary.
