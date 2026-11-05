// The room "capture": one main view (used for SAM 3.1, the photo overlay and the AI
// render) plus up to MAX_VIEWS - 1 extra views (video frames or more photos) that
// Muse Spark reads to see the whole room. A view is { blob, url, width, height, from, sharp? }.
export const MAX_VIEWS = 7

const toList = (capture) => (capture ? [{ ...capture, extras: undefined }, ...(capture.extras || [])] : [])
const fromList = (list) => {
  if (!list.length) return null
  const [main, ...extras] = list
  const { extras: _ignored, ...rest } = main
  return { ...rest, extras }
}

// Adds views; the first added set picks the main view (first photo, else the sharpest frame).
// Returns { capture, dropped } — dropped views did not fit (the caller frees their URLs).
export function addViews(capture, views, max = MAX_VIEWS) {
  let incoming = views.filter(Boolean)
  if (!capture && incoming.length) {
    const main = incoming.find(v => v.from !== 'video') || incoming.reduce((a, b) => ((b.sharp || 0) > (a.sharp || 0) ? b : a))
    incoming = [main, ...incoming.filter(v => v !== main)]
  }
  const all = [...toList(capture), ...incoming]
  return { capture: fromList(all.slice(0, max)), dropped: all.slice(max) }
}

// Removes view i (0 = the main view; the next one takes its place).
export function removeView(capture, i) {
  const list = toList(capture)
  return fromList(list.filter((_, k) => k !== i))
}

export const viewCount = (capture) => (capture ? 1 + (capture.extras?.length || 0) : 0)
export const hasVideo = (capture) => toList(capture).some(v => v.from === 'video')
