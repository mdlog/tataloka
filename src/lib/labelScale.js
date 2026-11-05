// Size of the 3D product labels. They follow the furniture's on-screen size
// (camera distance + viewer height), so zooming in/out grows/shrinks them with
// the room, clamped so they stay readable when zoomed out and never outgrow the
// frame when zoomed in.
export const LABEL_K = 0.0085
export const LABEL_MIN = 0.45
export const LABEL_MAX = 1.15

export function labelScale(distance, viewerHeight, fovDeg = 40) {
  const fovSpan = 2 * Math.tan((fovDeg * Math.PI) / 360) * Math.max(0.3, distance)
  return Math.min(LABEL_MAX, Math.max(LABEL_MIN, (LABEL_K * viewerHeight) / fovSpan))
}
