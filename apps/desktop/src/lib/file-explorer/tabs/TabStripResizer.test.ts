import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, tick } from 'svelte'
import TabStripResizer from './TabStripResizer.svelte'
import { MAX_TAB_STRIP_WIDTH, MIN_TAB_STRIP_WIDTH } from './tab-strip-layout'

/**
 * The drag contract: width = start ± pointer delta (direction flips with
 * `stripIsAfter` so dragging toward the file pane always shrinks the strip),
 * clamped to the `tab-strip-layout.ts` bounds, with resize-end on pointer-up
 * and reset on double-click.
 */

describe('TabStripResizer', () => {
  let target: HTMLElement
  let onResize: ReturnType<typeof vi.fn>
  let onResizeEnd: ReturnType<typeof vi.fn>
  let onReset: ReturnType<typeof vi.fn>

  // happy-dom doesn't track pointer capture; a per-file stub stands in so the
  // component's hasPointerCapture guard sees the same capture state a real
  // browser would.
  beforeEach(() => {
    const captured = new Set<number>()
    Element.prototype.setPointerCapture = vi.fn((id: number) => captured.add(id))
    Element.prototype.hasPointerCapture = vi.fn((id: number) => captured.has(id))
    Element.prototype.releasePointerCapture = vi.fn((id: number) => captured.delete(id))

    document.body.innerHTML = ''
    target = document.createElement('div')
    document.body.appendChild(target)
    onResize = vi.fn()
    onResizeEnd = vi.fn()
    onReset = vi.fn()
  })

  async function mountResizer(stripIsAfter: boolean): Promise<HTMLElement> {
    mount(TabStripResizer, {
      target,
      props: { currentWidth: 180, stripIsAfter, onResize, onResizeEnd, onReset },
    })
    await tick()
    return target.querySelector('.tab-strip-resizer') as HTMLElement
  }

  function pointer(el: HTMLElement, type: string, clientX: number) {
    el.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX, bubbles: true }))
  }

  it('widens with a rightward drag when the strip is before the pane', async () => {
    const el = await mountResizer(false)
    pointer(el, 'pointerdown', 100)
    pointer(el, 'pointermove', 150)
    expect(onResize).toHaveBeenLastCalledWith(230)
  })

  it('widens with a leftward drag when the strip is after the pane', async () => {
    const el = await mountResizer(true)
    pointer(el, 'pointerdown', 100)
    pointer(el, 'pointermove', 50)
    expect(onResize).toHaveBeenLastCalledWith(230)
  })

  it('clamps the dragged width to the strip bounds', async () => {
    const el = await mountResizer(false)
    pointer(el, 'pointerdown', 100)
    pointer(el, 'pointermove', 1_000)
    expect(onResize).toHaveBeenLastCalledWith(MAX_TAB_STRIP_WIDTH)
    pointer(el, 'pointermove', -1_000)
    expect(onResize).toHaveBeenLastCalledWith(MIN_TAB_STRIP_WIDTH)
  })

  it('ignores moves without an active drag and fires onResizeEnd on pointer-up', async () => {
    const el = await mountResizer(false)
    pointer(el, 'pointermove', 150)
    expect(onResize).not.toHaveBeenCalled()

    pointer(el, 'pointerdown', 100)
    pointer(el, 'pointerup', 150)
    expect(onResizeEnd).toHaveBeenCalledTimes(1)

    pointer(el, 'pointermove', 200)
    expect(onResize).not.toHaveBeenCalled()
  })

  it('fires onReset on double-click', async () => {
    const el = await mountResizer(false)
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
