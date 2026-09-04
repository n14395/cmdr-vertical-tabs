<script lang="ts">
    import { tString } from '$lib/intl/messages.svelte'
    import { clampTabStripWidth } from './tab-strip-layout'

    interface Props {
        /** The strip's current width in px, sampled at drag start. */
        currentWidth: number
        /** True when the strip sits on the far side of this divider (pane's right edge), so dragging LEFT widens it. */
        stripIsAfter: boolean
        onResize: (widthPx: number) => void
        onResizeEnd: () => void
        onReset: () => void
    }

    const { currentWidth, stripIsAfter, onResize, onResizeEnd, onReset }: Props = $props()

    let isDragging = $state(false)
    let dragStartX = 0
    let dragStartWidth = 0

    function handlePointerDown(event: PointerEvent) {
        event.preventDefault()
        isDragging = true
        dragStartX = event.clientX
        dragStartWidth = currentWidth
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    }

    function handlePointerMove(event: PointerEvent) {
        if (!(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return
        const delta = event.clientX - dragStartX
        onResize(clampTabStripWidth(dragStartWidth + (stripIsAfter ? -delta : delta)))
    }

    function handlePointerUp(event: PointerEvent) {
        ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
        isDragging = false
        onResizeEnd()
    }
</script>

<div
    class="tab-strip-resizer"
    class:dragging={isDragging}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    ondblclick={onReset}
    role="separator"
    aria-orientation="vertical"
    aria-label={tString('fileExplorer.tabBar.resizeAriaLabel')}
>
    <div class="handle"></div>
</div>

<style>
    /* Same 1px-divider-with-a-wider-grab-target construction as `PaneResizer`:
       the element itself is the hairline, and `::before` widens the hit area
       past it on both sides, so the strip and the file pane stay flush against
       the line. */
    .tab-strip-resizer {
        width: 1px;
        cursor: col-resize;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-border);
        flex-shrink: 0;
        position: relative;
        z-index: var(--z-sticky);
        transition: background-color var(--transition-fast);
    }

    /* Grab target only, never painted. Events on it bubble to the resizer. */
    .tab-strip-resizer::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: -1.5px;
        right: -1.5px;
        cursor: col-resize;
    }

    .tab-strip-resizer:hover,
    .tab-strip-resizer.dragging {
        background: var(--color-accent);
    }

    .handle {
        position: relative;
        flex-shrink: 0;
        width: 3px;
        height: 24px;
        border-radius: var(--radius-xs);
        background: var(--color-text-tertiary);
        opacity: 0;
        transition: opacity var(--transition-base);
    }

    .tab-strip-resizer:hover .handle,
    .tab-strip-resizer.dragging .handle {
        opacity: 1;
        background: white;
    }
</style>
