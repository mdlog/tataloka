// RoomScene registers a function that captures the current 3D frame
// (composited over the room photo in "My Photo" mode). The exporter calls it.
let provider = null

export function setSnapshotProvider(fn) { provider = fn }

export async function takeSnapshot() {
  if (!provider) return null
  return provider()
}
