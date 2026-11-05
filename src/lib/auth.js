// Browser client for /api/auth and /api/designs (session cookie is HTTP-only).

async function call(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = new Error(data.error || `HTTP ${res.status}`)
    e.code = data.code
    e.status = res.status
    throw e
  }
  return data
}

// ---------- accounts ----------
export const getMe = () => call('/api/auth/me').then(d => d.user).catch(() => null)
export const login = (email, password) => call('/api/auth/login', { method: 'POST', body: { email, password } }).then(d => d.user)
export const register = (name, email, password) => call('/api/auth/register', { method: 'POST', body: { name, email, password } }).then(d => d.user)
export const logout = () => call('/api/auth/logout', { method: 'POST' })
export const googleUrl = (returnTo = '/') => `/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`

// ---------- saved designs ----------
export const listDesigns = () => call('/api/designs').then(d => d.designs)
export const deleteDesignRender = (id) => call(`/api/designs/${encodeURIComponent(id)}/render`, { method: 'DELETE' })
export const getDesign = (id) => call(`/api/designs/${encodeURIComponent(id)}`).then(d => d.design)
export const createDesign = (graph) => call('/api/designs', { method: 'POST', body: { graph } }).then(d => d.design)
export const updateDesign = (id, graph) => call(`/api/designs/${encodeURIComponent(id)}`, { method: 'PUT', body: { graph } }).then(d => d.design)
export const deleteDesign = (id) => call(`/api/designs/${encodeURIComponent(id)}`, { method: 'DELETE' })

// ---------- keep the room photo across the Google sign-in redirect ----------
const STASH_KEY = 'tataloka_pending_capture'
export async function stashCapture(capture) {
  if (!capture?.blob) return
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(capture.blob)
    })
    sessionStorage.setItem(STASH_KEY, JSON.stringify({ dataUrl, width: capture.width, height: capture.height, name: capture.name, sample: capture.sample }))
  } catch { /* storage full or blocked — the user just re-uploads */ }
}
export async function restoreCapture() {
  try {
    const raw = sessionStorage.getItem(STASH_KEY)
    if (!raw) return null
    sessionStorage.removeItem(STASH_KEY)
    const s = JSON.parse(raw)
    const blob = await (await fetch(s.dataUrl)).blob()
    return { blob, url: URL.createObjectURL(blob), width: s.width, height: s.height, name: s.name, sample: s.sample }
  } catch { return null }
}

// ---------- credits ----------
// { enabled, credits: { plan, monthly, used, bonus, remaining, resetsAt }, history: [{ action, amount, at }] }
export const getCredits = () => call('/api/credits')
