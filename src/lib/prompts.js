// Prompts + JSON schemas for Muse Spark (Meta Model API, Chat Completions with
// response_format json_schema, strict). Used by server/meta.js.
import { ARCHETYPES, ROOM_DIMS } from './roomLayout.js'

const ROOM_LABEL = {
  living: 'living room', bedroom: 'bedroom', kitchen: 'kitchen',
  workspace: 'home office / workspace', dining: 'dining room', bathroom: 'bathroom',
}

const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })

export const DESIGN_SCHEMA = {
  name: 'room_design',
  strict: true,
  schema: obj({
    dimensions: obj({ w: { type: 'number' }, l: { type: 'number' }, h: { type: 'number' } }),
    floorMaterial: { type: 'string' },
    existingFurniture: { type: 'array', items: obj({ label: { type: 'string' }, keep: { type: 'boolean' } }) },
    items: {
      type: 'array',
      items: obj({
        archetype: { type: 'string', enum: ARCHETYPES },
        productId: { type: 'string' },
        name: { type: 'string' },
        x: { type: 'number' },
        z: { type: 'number' },
        rot: { type: 'number' },
        priceIDR: { type: 'number' },
        reason: { type: 'string' },
      }),
    },
    palette: { type: 'array', items: { type: 'string' } },
    materials: { type: 'array', items: { type: 'string' } },
    title: { type: 'string' },
    summary: { type: 'string' },
    tips: { type: 'array', items: { type: 'string' } },
  }),
}

// extraImages: more views of the same room (video frames or extra photos), after the main photo.
// knownDims: the size the user measured ({ w, l, h? } in meters) — exact, not an estimate.
export function designMessages({ roomType, style, locale, masks, imageDataUrl, extraImages = [], knownDims, budgetIDR, candidates = [] }) {
  const lang = locale === 'id' ? 'Bahasa Indonesia' : 'English'
  const hasImage = !!imageDataUrl
  const extras = hasImage ? extraImages.slice(0, 6) : []
  const typical = ROOM_DIMS[roomType] || ROOM_DIMS.living
  const sizeRule = knownDims
    ? `- dimensions: the user MEASURED this room: width ${knownDims.w} m (left-right, the wall facing the camera) x length ${knownDims.l} m${knownDims.h ? ` x height ${knownDims.h} m` : ''}. Return exactly these numbers${knownDims.h ? '' : ` (height: estimate, typical ${typical.h} m)`} and size every piece to fit this real floor area.`
    : `- dimensions: estimate the real room size from the photo${extras.length ? 's' : ''} (a typical ${roomType} is about ${typical.w} x ${typical.l} x ${typical.h} m); use doors (about 0.8 x 2.0 m), windows and furniture as scale references; without a photo use that size.`
  const system = `You are Tataloka, a professional interior designer for Indonesian homes.
Design a ${style} ${ROOM_LABEL[roomType] || roomType} using REAL products the user can buy.

Coordinate system (meters, origin = room center, viewer stands at +z):
- x from -w/2 (left wall) to +w/2 (right wall); z from -l/2 (back wall) to +l/2 (open front).
- rot = radians around the vertical axis; 0 = the item's front faces +z (the viewer),
  1.5708 = faces the right wall, -1.5708 = faces the left wall, 3.1416 = faces the back wall.
- Put sofas/beds/consoles against walls, keep 0.6 m walkways, never overlap items (rugs may sit under tables).
- The viewer looks in from the open front side (+z): keep tall pieces (TV benches with a TV, wardrobes, shelves)
  against the back wall or the side walls, never along the front edge.

Rules:
${sizeRule}
- items: 4-8 pieces. For each piece choose ONE product from the catalog below and copy its id into productId,
  its name into name and its priceIDR into priceIDR. Use productId "" only if no catalog product fits that piece
  (then give a realistic Indonesian marketplace price).
- Pick products whose style and colour work together for ${style}.${budgetIDR ? `\n- The total of priceIDR must not exceed Rp ${Math.round(budgetIDR).toLocaleString('id-ID')} — prefer cheaper products if needed.` : ''}
- reason: one short sentence in ${lang} on why this product suits the room.
- title: a short design name in ${lang} (e.g. "${locale === 'id' ? 'Ruang Tamu Japandi yang Hangat' : 'Warm Japandi Living Room'}").
- palette: 4 hex colours that match the chosen products; materials: 3-4 materials.
- summary: 2 sentences in ${lang} about the design idea for this specific room; tips: 2-3 practical tips in ${lang}.
- existingFurniture: furniture visible in the photo and whether to keep it (empty without a photo).

Product catalog (id | type | name | price IDR | size | styles):
${candidates.map(c => `${c.id} | ${c.type} | ${c.name} | ${c.priceIDR ?? 'n/a'} | ${c.size ? `${c.size.w}x${c.size.d} m` : '-'} | ${(c.styles || []).join('/')}`).join('\n') || '(empty)'}`

  const maskText = Array.isArray(masks) && masks.length
    ? `SAM 3.1 detections (label + bbox as % of image [x,y,w,h]): ${JSON.stringify(masks.slice(0, 40).map(m => ({ label: m.label, bbox: m.bbox })))}`
    : 'No segmentation available.'
  const userText = `Room type: ${roomType}. Target style: ${style}.${budgetIDR ? ` Budget: Rp ${Math.round(budgetIDR).toLocaleString('id-ID')}.` : ''} Output language: ${lang}.
${!hasImage ? 'No photo: design a typical room of this type.'
    : extras.length ? `Image 1 is the main view of the current room (the detections below refer to it). Images 2-${extras.length + 1} are other views of the SAME room from a video or extra photos: use all of them to see every wall, door, window and existing piece, and to judge the room's size.`
      : 'The attached photo shows the current room.'}${knownDims ? `\nMeasured room size: ${knownDims.w} m wide x ${knownDims.l} m long${knownDims.h ? ` x ${knownDims.h} m high` : ''}.` : ''}
${maskText}`

  const content = [{ type: 'text', text: userText }]
  if (hasImage) content.push({ type: 'image_url', image_url: { url: imageDataUrl } })
  for (const url of extras) content.push({ type: 'image_url', image_url: { url } })
  return [
    { role: 'system', content: system },
    { role: 'user', content },
  ]
}

export const COMMAND_SCHEMA = {
  name: 'room_command',
  strict: true,
  schema: obj({
    action: { type: 'string', enum: ['change_style', 'change_room', 'search', 'add_item', 'remove_item', 'budget', 'reset', 'unknown'] },
    style: { type: 'string', enum: ['Japandi', 'Minimalist', 'Scandinavian', 'Industrial', 'Modern', 'Bohemian', ''] },
    room: { type: 'string', enum: ['living', 'bedroom', 'kitchen', 'workspace', 'dining', 'bathroom', ''] },
    archetype: { type: 'string', enum: [...ARCHETYPES, ''] },
    query: { type: 'string' },
    reply: { type: 'string' },
  }),
}

export function commandMessages({ text, locale, context }) {
  const lang = locale === 'id' ? 'Bahasa Indonesia' : 'English'
  return [
    {
      role: 'system',
      content: `You turn a spoken/typed request about a room design into one action.
Actions: change_style (style), change_room (room), search (query = short product search in ${lang}),
add_item (archetype), remove_item (archetype), budget, reset, unknown.
Styles: Japandi, Minimalist, Scandinavian, Industrial, Modern, Bohemian.
Rooms: living, bedroom, kitchen, workspace, dining, bathroom. Archetypes: ${ARCHETYPES.join(', ')}.
Use "" for fields that do not apply.
reply: one short friendly sentence in ${lang} confirming what you will do (for unknown, explain what you can do).
Return only the JSON object.`,
    },
    {
      role: 'user',
      content: `Current design: ${JSON.stringify(context || {}).slice(0, 800)}\nRequest: ${text}`,
    },
  ]
}

export function renderPrompt({ roomType, style, items, hasPhoto }) {
  const list = (items || []).slice(0, 8).join('; ')
  const room = ROOM_LABEL[roomType] || roomType
  return hasPhoto
    ? `Redesign this exact ${room} in ${style} interior style. Keep the same camera angle, walls, windows and floor area. Furnish it with: ${list}. Photorealistic interior photography, natural daylight, no people, no text.`
    : `Photorealistic ${style} ${room} interior in an Indonesian home, furnished with: ${list}. Wide-angle interior photography, natural daylight, no people, no text.`
}
