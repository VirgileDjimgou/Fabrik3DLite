import { onBeforeUnmount } from 'vue'

export type FrameCallback = (time: number, delta: number) => void

/**
 * Composable that drives a `requestAnimationFrame` loop.
 *
 * - Callbacks are invoked with `time` (seconds since start) and
 *   `delta` (seconds since last frame).
 * - The loop is automatically cleaned up when the component unmounts.
 */
export function useAnimationLoop() {
  let animationId = 0
  let running = false
  let startTime = 0
  let lastTime = 0
  const callbacks: FrameCallback[] = []

  function tick() {
    if (!running) return
    animationId = requestAnimationFrame(tick)

    const now = performance.now() / 1000
    if (startTime === 0) {
      startTime = now
      lastTime = now
    }
    const time = now - startTime
    const delta = now - lastTime
    lastTime = now

    for (const cb of callbacks) cb(time, delta)
  }

  /** Register a frame callback. */
  function onFrame(cb: FrameCallback): void {
    callbacks.push(cb)
  }

  /** Start the loop. */
  function start(): void {
    if (running) return
    running = true
    startTime = 0
    tick()
  }

  /** Stop the loop. */
  function stop(): void {
    running = false
    cancelAnimationFrame(animationId)
  }

  onBeforeUnmount(() => stop())

  return { onFrame, start, stop }
}
