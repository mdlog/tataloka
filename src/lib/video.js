// Room video → a few sharp still frames, entirely in the browser (the video itself
// is never uploaded). The frames are then used like extra photos of the room.

export class VideoError extends Error {
  constructor(code, message) { super(message || code); this.code = code }
}

// Sharpness = variance of the Laplacian of a grayscale image (higher = less blur).
export function sharpness(gray, width, height) {
  let sum = 0, sumSq = 0, n = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const lap = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i]
      sum += lap; sumSq += lap * lap; n++
    }
  }
  if (!n) return 0
  const mean = sum / n
  return sumSq / n - mean * mean
}

// Evenly spaced sample times, skipping the shaky first/last moments.
export function sampleTimes(duration, n) {
  const start = duration * 0.04, end = duration * 0.96
  if (n <= 1) return [duration / 2]
  return Array.from({ length: n }, (_, i) => Number((start + ((end - start) * i) / (n - 1)).toFixed(3)))
}

// One frame per time bucket (the sharpest in it), so the views cover the whole pan.
export function chooseFrames(shots, count) {
  if (shots.length <= count) return [...shots].sort((a, b) => a.t - b.t)
  const sorted = [...shots].sort((a, b) => a.t - b.t)
  const out = []
  for (let k = 0; k < count; k++) {
    const bucket = sorted.slice(Math.floor((k * sorted.length) / count), Math.floor(((k + 1) * sorted.length) / count))
    if (bucket.length) out.push(bucket.reduce((best, s) => (s.sharp > best.sharp ? s : best)))
  }
  return out
}

function waitFor(el, ok, fail = 'error', ms = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { done(); reject(new VideoError('timeout')) }, ms)
    const onOk = () => { done(); resolve() }
    const onFail = () => { done(); reject(new VideoError('unsupported')) }
    function done() { clearTimeout(timer); el.removeEventListener(ok, onOk); el.removeEventListener(fail, onFail) }
    el.addEventListener(ok, onOk, { once: true })
    el.addEventListener(fail, onFail, { once: true })
  })
}

const toBlob = (canvas, quality) => new Promise((resolve, reject) =>
  canvas.toBlob(b => (b ? resolve(b) : reject(new VideoError('encode'))), 'image/jpeg', quality))

// Returns up to `count` frames [{ blob, url, width, height, t, sharp }] in time order.
export async function extractVideoFrames(file, { count = 6, maxSide = 1024, quality = 0.85, onProgress } = {}) {
  const src = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.preload = 'auto'
  video.src = src
  try {
    await waitFor(video, 'loadeddata')
    // Some mobile browsers only decode frames after playback has started once.
    try { await video.play(); video.pause() } catch { /* autoplay blocked — seeking still works */ }
    // WebM files recorded in a browser often report an Infinite duration until seeked to the end.
    if (video.duration === Infinity) {
      video.currentTime = 1e7
      await waitFor(video, 'seeked').catch(() => {})
    }
    const { duration, videoWidth, videoHeight } = video
    if (!videoWidth || !videoHeight) throw new VideoError('unsupported')
    if (!Number.isFinite(duration) || duration < 1.5) throw new VideoError('too_short')

    const scale = Math.min(1, maxSide / Math.max(videoWidth, videoHeight))
    const width = Math.round(videoWidth * scale), height = Math.round(videoHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    const sw = 160, sh = Math.max(1, Math.round((160 * height) / width))
    const small = document.createElement('canvas')
    small.width = sw; small.height = sh
    const sctx = small.getContext('2d', { willReadFrequently: true })

    const times = sampleTimes(duration, Math.max(count * 2, 8))
    const shots = []
    for (let i = 0; i < times.length; i++) {
      video.currentTime = times[i]
      await waitFor(video, 'seeked')
      ctx.drawImage(video, 0, 0, width, height)
      sctx.drawImage(canvas, 0, 0, sw, sh)
      const px = sctx.getImageData(0, 0, sw, sh).data
      const gray = new Float32Array(sw * sh)
      for (let p = 0; p < gray.length; p++) gray[p] = 0.299 * px[p * 4] + 0.587 * px[p * 4 + 1] + 0.114 * px[p * 4 + 2]
      shots.push({ t: times[i], sharp: sharpness(gray, sw, sh), blob: await toBlob(canvas, quality) })
      onProgress?.((i + 1) / times.length)
    }
    return chooseFrames(shots, count).map(s => ({ blob: s.blob, url: URL.createObjectURL(s.blob), width, height, t: s.t, sharp: s.sharp }))
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(src)
  }
}
