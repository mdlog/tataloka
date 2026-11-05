// Microphone helpers (browser only).
// Meta's /asr/transcribe accepts WAV, while MediaRecorder produces webm/ogg,
// so recordings are decoded and re-encoded as 16 kHz mono 16-bit PCM WAV.

export async function recordingToWav(blob, sampleRate = 16000) {
  const AC = window.AudioContext || window.webkitAudioContext
  const ctx = new AC()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const frames = Math.max(1, Math.ceil(decoded.duration * sampleRate))
    const offline = new OfflineAudioContext(1, frames, sampleRate)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start()
    const rendered = await offline.startRendering()
    return encodeWav(rendered.getChannelData(0), sampleRate)
  } finally {
    ctx.close?.()
  }
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buffer)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

// Browser speech recognition (Chrome/Edge) — used when the Meta key is absent.
export function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}
