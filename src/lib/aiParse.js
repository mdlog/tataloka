// Parsers for Meta Model API outputs. Pure functions, shared by the server
// (server/meta.js) and node:test.

// Pull the first JSON object out of a model reply. Handles plain JSON,
// ```json fenced blocks and prose before/after the object.
export function extractJSON(text) {
  if (text && typeof text === 'object') return text
  if (typeof text !== 'string' || !text.trim()) throw new Error('empty model output')
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [text, fenced?.[1]].filter(Boolean)
  for (const c of candidates) {
    try { return JSON.parse(c) } catch { /* try next */ }
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) } catch { /* fall through */ }
  }
  throw new Error('model output is not valid JSON')
}

// Chat Completions content may be a string or an array of parts.
export function messageText(data) {
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(p => (typeof p === 'string' ? p : p?.text || '')).join('')
  return ''
}

// Responses API (non-streaming) → concatenated output text.
export function responsesText(data) {
  if (typeof data?.output_text === 'string') return data.output_text
  const out = []
  for (const item of data?.output || []) {
    for (const part of item?.content || []) if (typeof part?.text === 'string') out.push(part.text)
  }
  return out.join('')
}

// SAM 3.1 returns special-token text, one box (+ mask) per match, e.g.
//   <0f>0<|box;x1=353;y1=382;x2=453;y2=427;w=537;h=561|><|mask;...|>
// Box coordinates are source pixels (xyxy); w/h are the source image size.
// We convert each box to percentage [x, y, width, height] for the overlay.
export function parseSamBoxes(text, label, fallbackSize = {}) {
  const boxes = []
  const re = /<\|box;([^|>]*)\|>/g
  let m
  while ((m = re.exec(String(text || '')))) {
    const kv = {}
    for (const pair of m[1].split(';')) {
      const [k, v] = pair.split('=')
      if (k) kv[k.trim()] = Number(v)
    }
    const W = kv.w || fallbackSize.width
    const H = kv.h || fallbackSize.height
    if (![kv.x1, kv.y1, kv.x2, kv.y2, W, H].every(Number.isFinite) || !W || !H) continue
    const x = Math.max(0, Math.min(kv.x1, kv.x2)), y = Math.max(0, Math.min(kv.y1, kv.y2))
    const bw = Math.abs(kv.x2 - kv.x1), bh = Math.abs(kv.y2 - kv.y1)
    if (bw < 2 || bh < 2) continue
    boxes.push({
      label,
      bbox: [x / W * 100, y / H * 100, bw / W * 100, bh / H * 100].map(v => Number(v.toFixed(2))),
      source: 'sam-3.1',
    })
  }
  return boxes
}

// Accumulate the text of a Responses API SSE stream body.
export function parseResponsesSSE(raw) {
  let text = ''
  let completed = null
  for (const block of String(raw || '').split(/\r?\n\r?\n/)) {
    const dataLines = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim())
    if (!dataLines.length) continue
    const payload = dataLines.join('\n')
    if (payload === '[DONE]') continue
    let ev
    try { ev = JSON.parse(payload) } catch { continue }
    if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string') text += ev.delta
    else if (ev.type === 'response.completed' && ev.response) completed = ev.response
    else if (ev.type === 'error' || ev.type === 'response.failed') {
      throw new Error(ev.error?.message || ev.response?.error?.message || 'SAM stream failed')
    }
  }
  if (!text && completed) text = responsesText(completed)
  return text
}

// ASR responses: find the transcript wherever the API puts it.
export function pickTranscript(data) {
  if (!data) return ''
  if (typeof data === 'string') return data.trim()
  for (const key of ['text', 'transcript', 'transcription']) {
    if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim()
  }
  for (const key of ['results', 'segments', 'alternatives', 'utterances']) {
    if (Array.isArray(data[key]) && data[key].length) {
      const joined = data[key].map(pickTranscript).filter(Boolean).join(' ').trim()
      if (joined) return joined
    }
  }
  for (const v of Object.values(data)) {
    if (v && typeof v === 'object') {
      const found = pickTranscript(v)
      if (found) return found
    }
  }
  return ''
}

// Base64 magic numbers → MIME type (Muse Image returns WebP).
export function sniffImageType(b64) {
  if (b64.startsWith('iVBOR')) return 'image/png'
  if (b64.startsWith('/9j/')) return 'image/jpeg'
  if (b64.startsWith('UklGR')) return 'image/webp'
  return 'image/png'
}

// Images API → data URL or remote URL.
export function pickImage(data) {
  const first = data?.data?.[0] || data?.images?.[0] || null
  if (!first) return null
  if (first.b64_json) return `data:${sniffImageType(first.b64_json)};base64,${first.b64_json}`
  if (typeof first.url === 'string') return first.url
  return null
}
