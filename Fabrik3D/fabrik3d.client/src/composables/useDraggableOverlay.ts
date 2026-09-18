import { computed, onBeforeUnmount, ref, type CSSProperties } from 'vue'

type Point = { x: number, y: number }
const RESET_EVENT = 'fabrik3d:reset-floating-panels'

/**
 * Standard controller for every floating HMI/editor panel. New panels should
 * bind `panelStyle` on their root and call `beginDrag` only from their header,
 * so buttons and inputs retain their normal interactions.
 */
export function useDraggableOverlay(storageKey: string, initial: Point) {
  const position = ref(load(storageKey, initial))
  let origin: Point | null = null
  let start: Point | null = null
  const panelStyle = computed<CSSProperties>(() => ({ position: 'fixed', left: `${position.value.x}px`, top: `${position.value.y}px`, right: 'auto', bottom: 'auto' }))
  function beginDrag(event: PointerEvent): void {
    if (event.button !== 0) return
    event.preventDefault()
    origin = { ...position.value }; start = { x: event.clientX, y: event.clientY }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
  }
  function move(event: PointerEvent): void {
    if (!origin || !start) return
    position.value = { x: Math.max(0, Math.min(window.innerWidth - 80, origin.x + event.clientX - start.x)), y: Math.max(0, Math.min(window.innerHeight - 40, origin.y + event.clientY - start.y)) }
  }
  function end(): void { window.removeEventListener('pointermove', move); origin = null; start = null; localStorage.setItem(storageKey, JSON.stringify(position.value)) }
  function reset(): void { position.value = initial; localStorage.removeItem(storageKey) }
  function resetFromCommand(): void { reset() }
  window.addEventListener(RESET_EVENT, resetFromCommand)
  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener(RESET_EVENT, resetFromCommand)
  })
  return { panelStyle, beginDrag, reset }
}

/** Resets every mounted floating panel and clears its saved browser position. */
export function resetFloatingOverlays(): void {
  window.dispatchEvent(new Event(RESET_EVENT))
}

function load(key: string, fallback: Point): Point { try { const value = JSON.parse(localStorage.getItem(key) ?? ''); return Number.isFinite(value.x) && Number.isFinite(value.y) ? value : fallback } catch { return fallback } }
