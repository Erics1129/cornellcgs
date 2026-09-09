/** Shared by the pointer projection and the v4 artwork shader. */
export const EYE_ART = {
  aspect: 1.5, anchorX: .52, anchorY: .48, irisX: .577, irisY: .425,
  desktopWidth: 1.10, desktopHeight: 2.45, compactWidth: 1.31,
}

type Point = { x: number; y: number }
export type EyeGaze = Point & { vx: number; vy: number }
type EyeRect = { left: number; top: number; width: number; height: number }

/** Positive y looks upward, matching u_pointer. Use the rendered artwork's
 * iris, including its cover crop, rather than the center of the viewport. */
export function eyePointerTarget(clientX: number, clientY: number, rect: EyeRect, compact: boolean): Point {
  const width = Math.max(1, compact ? rect.width * EYE_ART.compactWidth
    : Math.min(rect.width * EYE_ART.desktopWidth, rect.height * EYE_ART.desktopHeight))
  const height = width / EYE_ART.aspect
  const irisX = rect.left + rect.width / 2 + (EYE_ART.irisX - EYE_ART.anchorX) * width
  const irisY = rect.top + rect.height / 2 + (EYE_ART.irisY - EYE_ART.anchorY) * height
  const x = (clientX - irisX) / (width * .32)
  const y = (irisY - clientY) / (height * .30)
  const radius = Math.max(1, Math.hypot(x, y))
  return { x: x / radius, y: y / radius }
}

/** Exact critically damped response for a held target, independent of refresh
 * rate. A slower release lets autonomous fixation resume without snapping. */
export function stepEyeGaze(gaze: EyeGaze, target: Point, dt: number, tracking: boolean) {
  if (!(dt > 0) || !Number.isFinite(dt)) return
  const omega = tracking ? 20 : 9
  const decay = Math.exp(-omega * dt)
  const targetRadius = Math.max(1, Math.hypot(target.x, target.y))
  const tx = target.x / targetRadius, ty = target.y / targetRadius
  const dx = gaze.x - tx, dy = gaze.y - ty
  const cx = gaze.vx + omega * dx, cy = gaze.vy + omega * dy
  gaze.x = tx + (dx + cx * dt) * decay
  gaze.y = ty + (dy + cy * dt) * decay
  gaze.vx = (gaze.vx - omega * cx * dt) * decay
  gaze.vy = (gaze.vy - omega * cy * dt) * decay

  // Direction changes can retain a little momentum. Keep the entire motion
  // inside the eye's elliptical range, removing only outward velocity.
  const radius = Math.hypot(gaze.x, gaze.y)
  if (radius > 1) {
    gaze.x /= radius; gaze.y /= radius
    const outward = Math.max(0, gaze.vx * gaze.x + gaze.vy * gaze.y)
    gaze.vx -= outward * gaze.x; gaze.vy -= outward * gaze.y
  }
}
