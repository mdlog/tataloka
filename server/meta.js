// Meta Model API client (https://dev.meta.ai). Runs on the server only, so the
// API key never reaches the browser.
//   Chat Completions  POST /chat/completions   muse-spark-1.3 (vision + JSON schema)
//   Responses (SAM)   POST /responses          sam-3.1 (text concept + image → boxes)
//   Images            POST /images/generations, /images/edits   muse-image-1.0
//   Speech-to-text    POST /asr/transcribe     muse-voice-transcribe-1.0 (WAV)
import { extractJSON, messageText, parseResponsesSSE, responsesText, parseSamBoxes, pickTranscript, pickImage } from '../src/lib/aiParse.js'
import { DESIGN_SCHEMA, COMMAND_SCHEMA, designMessages, commandMessages, renderPrompt } from '../src/lib/prompts.js'
import { productsFromSearchResults } from './retail.js'
import { detectTerms, titleMatchesArchetype, titleMatchesQuery } from '../src/data/terms.js'

export class MetaApiError extends Error {
  constructor(message, status) { super(message); this.status = status }
}

export function createMetaClient({ apiKey, baseUrl, models, reasoningEffort, samConcepts, fetchImpl = globalThis.fetch }) {
  const base = baseUrl.replace(/\/+$/, '')

  async function call(path, { body, form, timeoutMs = 60000, accept = 'application/json' }) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const headers = { Authorization: `Bearer ${apiKey}`, Accept: accept }
      if (!form) headers['Content-Type'] = 'application/json'
      const res = await fetchImpl(`${base}${path}`, {
        method: 'POST', headers, body: form || JSON.stringify(body), signal: ctrl.signal,
      })
      const text = await res.text()
      if (!res.ok) {
        let msg = text.slice(0, 300)
        try { const j = JSON.parse(text); msg = j.error?.message || j.message || msg } catch { /* keep raw */ }
        throw new MetaApiError(`${path} → HTTP ${res.status}: ${msg}`, res.status)
      }
      return { text, contentType: res.headers.get('content-type') || '' }
    } catch (e) {
      if (e.name === 'AbortError') throw new MetaApiError(`${path} timed out after ${timeoutMs / 1000}s`, 504)
      throw e
    } finally {
      clearTimeout(timer)
    }
  }

  // Chat Completions with JSON-schema structured output. Reasoning tokens
  // count against max_completion_tokens, so the budget is generous.
  async function chatJSON({ messages, schema, maxTokens = 8000, timeoutMs = 90000 }) {
    const body = {
      model: models.text,
      messages,
      max_completion_tokens: maxTokens,
      reasoning_effort: reasoningEffort,
      response_format: { type: 'json_schema', json_schema: schema },
    }
    let res
    try {
      res = await call('/chat/completions', { body, timeoutMs })
    } catch (e) {
      // Some deployments reject structured output or an effort level — retry plain.
      if (e.status !== 400 && e.status !== 422) throw e
      const { response_format, reasoning_effort, ...plain } = body
      res = await call('/chat/completions', { body: plain, timeoutMs })
    }
    const data = JSON.parse(res.text)
    const text = messageText(data)
    if (!text) {
      const reason = data.choices?.[0]?.finish_reason
      throw new MetaApiError(`empty reply from ${models.text}${reason ? ` (finish_reason: ${reason})` : ''}`, 502)
    }
    return { json: extractJSON(text), usage: data.usage || null }
  }

  async function design({ imageDataUrl, extraImages, knownDims, masks, roomType, style, locale, budgetIDR, candidates }) {
    const { json, usage } = await chatJSON({
      messages: designMessages({ roomType, style, locale, masks, imageDataUrl, extraImages, knownDims, budgetIDR, candidates }),
      schema: DESIGN_SCHEMA,
    })
    return { design: json, model: models.text, usage }
  }

  // Real marketplace listings via Meta web search (Responses API). Only URLs the
  // search engine actually returned, on Indonesian store product pages, survive;
  // the model's own text is not trusted for URLs or prices.
  async function marketSearch({ query, archetype, max = 8 }) {
    const q = String(query).replace(/["\n]/g, ' ').trim().slice(0, 120)
    const body = {
      model: models.text,
      reasoning: { effort: 'minimal' },
      tools: [{ type: 'web_search', search_context_size: 'low', user_location: { type: 'approximate', country: 'ID' } }],
      include: ['web_search_call.results'],
      input: `Run exactly these two web searches and nothing else:\n1. ${q} site:tokopedia.com\n2. ${q} site:shopee.co.id\nThen reply with the single word: done`,
    }
    const res = await call('/responses', { body, timeoutMs: 60000 })
    const data = JSON.parse(res.text)
    const results = []
    for (const item of data.output || []) {
      if (item.type === 'web_search_call') results.push(...(item.results || []))
    }
    const archetypes = archetype ? [archetype] : [...detectTerms(q).archetypes]
    const ofType = archetypes.length
      ? results.filter(r => archetypes.some(a => titleMatchesArchetype(r.title, a)))
      : results
    // Prefer listings that also match the specific words ("rotan", "lantai"…).
    const specific = ofType.filter(r => titleMatchesQuery(r.title, q))
    const relevant = specific.length ? specific : ofType
    return {
      products: productsFromSearchResults(relevant, max).map(p => ({ ...p, archetype: archetypes.find(a => titleMatchesArchetype(p.name, a)) || archetypes[0] || null })),
      searches: (data.output || []).filter(o => o.type === 'web_search_call').length,
      usage: data.usage || null,
      model: models.text,
    }
  }

  async function command({ text, locale, context }) {
    const { json, usage } = await chatJSON({
      messages: commandMessages({ text, locale, context }),
      schema: COMMAND_SCHEMA,
      maxTokens: 3000,
      timeoutMs: 45000,
    })
    return { command: json, model: models.text, usage }
  }

  // SAM 3.1: one concept per request (boxes in the stream are not labelled),
  // concepts run with limited concurrency.
  async function segmentConcept(imageDataUrl, concept, size) {
    const body = {
      model: models.segment,
      input: [{
        type: 'message', role: 'user',
        content: [
          { type: 'input_text', text: concept },
          { type: 'input_image', image_url: imageDataUrl },
        ],
      }],
      stream: true,
    }
    const res = await call('/responses', { body, timeoutMs: 45000, accept: 'text/event-stream' })
    const out = res.contentType.includes('application/json') ? responsesText(JSON.parse(res.text)) : parseResponsesSSE(res.text)
    return parseSamBoxes(out, concept, size)
  }

  async function segment({ imageDataUrl, width, height, concepts = samConcepts }) {
    const queue = [...concepts]
    const masks = []
    const errors = []
    async function worker() {
      while (queue.length) {
        const c = queue.shift()
        try { masks.push(...(await segmentConcept(imageDataUrl, c, { width, height }))) }
        catch (e) { errors.push(`${c}: ${e.message}`) }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, concepts.length) }, worker))
    if (errors.length === concepts.length) throw new MetaApiError(`SAM 3.1 failed — ${errors[0]}`, 502)
    return { masks, model: models.segment, conceptErrors: errors }
  }

  async function render({ imageDataUrl, roomType, style, items }) {
    const prompt = renderPrompt({ roomType, style, items, hasPhoto: !!imageDataUrl })
    const res = imageDataUrl
      ? await call('/images/edits', { body: { model: models.image, prompt, images: [{ image_url: imageDataUrl }], n: 1 }, timeoutMs: 120000 })
      : await call('/images/generations', { body: { model: models.image, prompt, n: 1 }, timeoutMs: 120000 })
    const image = pickImage(JSON.parse(res.text))
    if (!image) throw new MetaApiError('image API returned no image', 502)
    return { image, model: models.image, prompt }
  }

  // Request shape follows the documented multipart example exactly.
  async function transcribe({ wav }) {
    const form = new FormData()
    form.append('request', new Blob([JSON.stringify({
      model: models.asr, audioEncoding: 'WAV', mode: 'PUSH_TO_TALK',
    })], { type: 'application/json' }))
    form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'recording.wav')
    const res = await call('/asr/transcribe', { form, timeoutMs: 60000 })
    let data
    try { data = JSON.parse(res.text) } catch { data = res.text }
    return { text: pickTranscript(data), model: models.asr }
  }

  async function listModels() {
    const res = await fetchImpl(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) throw new MetaApiError(`/models → HTTP ${res.status}`, res.status)
    const data = await res.json()
    return (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean)
  }

  return { design, command, segment, render, transcribe, listModels, chatJSON, marketSearch }
}
