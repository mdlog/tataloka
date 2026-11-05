import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractJSON, messageText, parseSamBoxes, parseResponsesSSE, pickTranscript, pickImage, responsesText } from '../src/lib/aiParse.js'

describe('extractJSON', () => {
  it('parses plain, fenced and wrapped JSON', () => {
    assert.deepEqual(extractJSON('{"a":1}'), { a: 1 })
    assert.deepEqual(extractJSON('```json\n{"a":2}\n```'), { a: 2 })
    assert.deepEqual(extractJSON('Here you go: {"a":3} — enjoy'), { a: 3 })
  })
  it('throws on empty or invalid output', () => {
    assert.throws(() => extractJSON(''))
    assert.throws(() => extractJSON('no json here'))
  })
})

describe('messageText / responsesText', () => {
  it('reads string and array content', () => {
    assert.equal(messageText({ choices: [{ message: { content: 'hi' } }] }), 'hi')
    assert.equal(messageText({ choices: [{ message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } }] }), 'ab')
    assert.equal(messageText({}), '')
  })
  it('reads Responses API output', () => {
    assert.equal(responsesText({ output: [{ content: [{ type: 'output_text', text: 'x' }] }] }), 'x')
    assert.equal(responsesText({ output_text: 'y' }), 'y')
  })
})

describe('SAM 3.1 special-token parsing', () => {
  const sample = '<0f>0<|box;x1=353;y1=382;x2=453;y2=427;w=537;h=561|><|mask;x=0;y=0;data=46,101,~|>1<|box;x1=0;y1=0;x2=537;y2=100;w=537;h=561|>'
  it('converts pixel xyxy boxes to percentage xywh', () => {
    const boxes = parseSamBoxes(sample, 'chair')
    assert.equal(boxes.length, 2)
    assert.equal(boxes[0].label, 'chair')
    assert.deepEqual(boxes[0].bbox, [65.74, 68.09, 18.62, 8.02])
    assert.deepEqual(boxes[1].bbox, [0, 0, 100, 17.83])
  })
  it('uses the client image size when the token has no w/h', () => {
    const [b] = parseSamBoxes('<|box;x1=10;y1=10;x2=60;y2=110|>', 'lamp', { width: 100, height: 200 })
    assert.deepEqual(b.bbox, [10, 5, 50, 50])
  })
  it('zero matches is a valid outcome', () => {
    assert.deepEqual(parseSamBoxes('<0f>', 'door'), [])
  })
  it('accumulates SSE deltas', () => {
    const sse = [
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"<0f>0<|box;x1=1;"}',
      '',
      'data: {"type":"response.output_text.delta","delta":"y1=2;x2=51;y2=52;w=100;h=100|>"}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')
    assert.equal(parseSamBoxes(parseResponsesSSE(sse), 'rug').length, 1)
  })
  it('falls back to response.completed output and surfaces stream errors', () => {
    const done = 'data: {"type":"response.completed","response":{"output":[{"content":[{"text":"<|box;x1=0;y1=0;x2=5;y2=5;w=10;h=10|>"}]}]}}\n\n'
    assert.equal(parseSamBoxes(parseResponsesSSE(done), 'x').length, 1)
    assert.throws(() => parseResponsesSSE('data: {"type":"error","error":{"message":"bad image"}}\n\n'), /bad image/)
  })
})

describe('pickTranscript / pickImage', () => {
  it('finds transcripts in common shapes', () => {
    assert.equal(pickTranscript({ text: ' halo ' }), 'halo')
    assert.equal(pickTranscript({ results: [{ transcript: 'ganti' }, { transcript: 'gaya' }] }), 'ganti gaya')
    assert.equal(pickTranscript({ result: { alternatives: [{ transcript: 'cari sofa' }] } }), 'cari sofa')
    assert.equal(pickTranscript({}), '')
  })
  it('returns a data URL or remote URL', () => {
    assert.equal(pickImage({ data: [{ b64_json: 'AAA' }] }), 'data:image/png;base64,AAA')
    assert.equal(pickImage({ data: [{ b64_json: 'UklGRxx' }] }), 'data:image/webp;base64,UklGRxx')
    assert.equal(pickImage({ data: [{ url: 'https://x/y.png' }] }), 'https://x/y.png')
    assert.equal(pickImage({ data: [] }), null)
  })
})
