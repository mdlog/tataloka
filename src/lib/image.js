// Image helpers (browser only).

// Downscale to maxSide and re-encode as JPEG. Always returns a JPEG blob plus
// its size (needed to normalise SAM boxes) — HEIC/PNG uploads are converted too.
export async function compressImage(file, maxSide = 1024, quality = 0.85) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('could not encode image'))), 'image/jpeg', quality))
  return { blob, width, height }
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function downloadDataURL(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function downloadText(text, filename, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  downloadDataURL(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
