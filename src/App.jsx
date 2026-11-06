import React, { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './components/Icon.jsx'
import SetupView from './components/SetupView.jsx'
import GeneratingView from './components/GeneratingView.jsx'
import ResultsView from './components/ResultsView.jsx'
import CatalogDrawer from './components/CatalogDrawer.jsx'
import AssistantDock from './components/AssistantDock.jsx'
import PrintSheet from './components/PrintSheet.jsx'
import AuthModal from './components/AuthModal.jsx'
import UserMenu from './components/UserMenu.jsx'
import MyDesignsDrawer from './components/MyDesignsDrawer.jsx'
import { CreditsChip, CreditsModal } from './components/Credits.jsx'
import MobileNav from './components/MobileNav.jsx'
import AccountSheet from './components/AccountSheet.jsx'
import VerifyEmail from './components/VerifyEmail.jsx'
import { authErrorText } from './lib/authErrors.js'
import useRoomStore from './hooks/useRoomStore.js'
import { getHealth, segmentRoom, designRoom } from './lib/api.js'
import { addProduct, removeItem, updateItem, swapProduct, resizeRoom } from './lib/roomGraph.js'
import { addViews, removeView, viewCount } from './lib/views.js'
import { clampPosToRoom, formatIDR } from './lib/roomLayout.js'
import { archLabel, priceDateLabel } from './lib/labels.js'
import { takeSnapshot } from './lib/sceneSnapshot.js'
import { downloadText } from './lib/image.js'
import { getMe, logout as apiLogout, getDesign, createDesign, updateDesign, deleteDesignRender, stashCapture, restoreCapture, getCredits } from './lib/auth.js'
import { ROUTE_COSTS } from './data/plans.js'
import { bestProductFor, CATALOG_META } from './data/catalog.js'
import { ROOM_IDS, getRoom } from './data/rooms.js'
import { STYLE_IDS, getStyle } from './data/styles.js'

function csvCell(v) { return `"${String(v ?? '').replace(/"/g, '""')}"` }

// Resolves when every image inside el has loaded or failed (at most `ms`).
function imagesLoaded(el, ms = 4000) {
  const pending = [...(el?.querySelectorAll('img') || [])].filter(img => !img.complete)
  const all = Promise.all(pending.map(img => new Promise(done => {
    img.addEventListener('load', done, { once: true })
    img.addEventListener('error', done, { once: true })
  })))
  return Promise.race([all, new Promise(done => setTimeout(done, ms))])
}

export default function App() {
  const {
    locale, setLocale, selectedRoom, selectedStyle, setSelectedRoom, setSelectedStyle,
    budget, setBudget, roomSize, setRoomSize, roomGraph, setRoomGraph, updateRoomGraph, designId, setDesignId,
  } = useRoomStore()
  const [capture, setCapture] = useState(null) // { blob, url, width, height, name, sample }
  const [masks, setMasks] = useState(null)
  const [segInfo, setSegInfo] = useState(null)
  const [run, setRun] = useState(null) // { kind:'full'|'restyle', step, startedAt }
  const [health, setHealth] = useState({ live: false, checked: false })
  const [selectedId, setSelectedId] = useState(null)
  const [drawer, setDrawer] = useState(null) // { type:'add' } | { type:'swap', item } (+ query)
  const [render, setRender] = useState(null)
  const [lastShot, setLastShot] = useState(null)
  const [printShot, setPrintShot] = useState(null)
  const [toast, setToast] = useState('')
  const [user, setUser] = useState(undefined) // undefined = loading, null = guest
  const [authModal, setAuthModal] = useState(null) // { mode, reason, error, pending }
  const [verifyModal, setVerifyModal] = useState(null) // { sent, resendIn, pending } — email + password accounts confirm their email
  const [designsOpen, setDesignsOpen] = useState(false)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [credits, setCredits] = useState(null) // { plan, monthly, used, bonus, remaining, resetsAt } when credits are on
  const [creditsModal, setCreditsModal] = useState(null) // { need? }
  const [accountOpen, setAccountOpen] = useState(false) // phones: the Account tab
  const [installPrompt, setInstallPrompt] = useState(null) // Chrome/Android "Install app" event
  const lastSaved = useRef('')
  const saving = useRef(null) // the save in flight, so saves never overlap
  const runId = useRef(0)
  const toastTimer = useRef(null)
  const t = (en, id) => (locale === 'id' ? id : en)
  const live = health.live

  useEffect(() => { getHealth().then(h => setHealth({ ...h, checked: true })) }, [])
  // Session + return from Google sign-in (?auth_error=… on failure).
  useEffect(() => {
    getMe().then(u => setUser(u))
    restoreCapture().then(c => { if (c) setCapture(c) })
    // Links from the landing page / Google: ?style=…&room=…, ?signup=1, ?login=1, ?designs=1, ?auth_error=…
    const params = new URLSearchParams(window.location.search)
    if (STYLE_IDS.includes(params.get('style'))) setSelectedStyle(params.get('style'))
    if (ROOM_IDS.includes(params.get('room'))) setSelectedRoom(params.get('room'))
    const err = params.get('auth_error')
    if (err) setAuthModal({ mode: 'login', error: err })
    else if (params.has('signup')) setAuthModal({ mode: 'register' })
    else if (params.has('login')) setAuthModal({ mode: 'login' })
    if (params.has('designs')) getMe().then(u => u && setDesignsOpen(true))
    if (params.has('verified')) setTimeout(() => flash(t('Email verified — your 30 AI credits are ready.', 'Email terverifikasi — 30 kredit AI siap dipakai.')), 300)
    const verifyError = params.get('verify_error')
    if (verifyError) {
      setTimeout(() => flash(authErrorText(`verify_${verifyError}`, locale) || t('That verification link is no longer valid.', 'Link verifikasi itu sudah tidak berlaku.')), 300)
      getMe().then(u => { if (u && !u.emailVerified) setVerifyModal({ sent: false, resendIn: 0 }) })
    }
    if ([...params.keys()].length) window.history.replaceState(null, '', window.location.pathname)
  }, [])
  // Any AI call refused because the email is not verified yet opens the verification dialog.
  useEffect(() => {
    const onVerify = () => setVerifyModal(m => m || { sent: false, resendIn: 0 })
    window.addEventListener('tataloka-verify-email', onVerify)
    return () => window.removeEventListener('tataloka-verify-email', onVerify)
  }, [])
  // Any AI call answered with 401 opens the login dialog.
  useEffect(() => {
    const onAuth = () => setAuthModal(m => m || { mode: 'login', reason: t('Log in to use the AI features — it’s free.', 'Masuk untuk memakai fitur AI — gratis.') })
    window.addEventListener('tataloka-auth-required', onAuth)
    return () => window.removeEventListener('tataloka-auth-required', onAuth)
  }, [locale])
  // AI credits of the logged-in account: loaded on login, kept current by every AI call.
  useEffect(() => {
    if (!user) { setCredits(null); return }
    getCredits().then(d => setCredits(d.enabled ? d.credits : null)).catch(() => setCredits(null))
  }, [user?.id])
  useEffect(() => {
    const onLeft = e => setCredits(c => c && { ...c, remaining: e.detail.remaining })
    const onEmpty = e => { if (e.detail.credits) setCredits(e.detail.credits); setCreditsModal({ need: e.detail.need }) }
    window.addEventListener('tataloka-credits', onLeft)
    window.addEventListener('tataloka-no-credits', onEmpty)
    return () => { window.removeEventListener('tataloka-credits', onLeft); window.removeEventListener('tataloka-no-credits', onEmpty) }
  }, [])
  // "Install app" (Android/desktop Chrome): main.jsx keeps the browser's prompt, which may
  // arrive before or after this mounts, for the Account sheet.
  useEffect(() => {
    const take = () => { if (window.__tatalokaInstall) setInstallPrompt(window.__tatalokaInstall) }
    const onInstalled = () => { window.__tatalokaInstall = null; setInstallPrompt(null) }
    take()
    window.addEventListener('tataloka-install-ready', take)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('tataloka-install-ready', take); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  // → 'accepted' | 'dismissed' | 'unavailable'. The browser's event can be used once only.
  async function install() {
    const ev = installPrompt
    if (!ev) return 'unavailable'
    window.__tatalokaInstall = null
    setInstallPrompt(null)
    try {
      await ev.prompt()
      const choice = await ev.userChoice
      return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed'
    } catch {
      return 'unavailable'
    }
  }
  // Views share object URLs across captures (adding a view keeps the others): free only unused ones.
  const viewUrls = useRef(new Set())
  useEffect(() => {
    const now = new Set([capture?.url, ...(capture?.extras || []).map(v => v.url)].filter(Boolean))
    for (const url of viewUrls.current) if (!now.has(url)) URL.revokeObjectURL(url)
    viewUrls.current = now
  }, [capture])
  function onAddViews(views) {
    const { capture: next, dropped } = addViews(capture, views)
    dropped.forEach(v => URL.revokeObjectURL(v.url))
    if (dropped.length) flash(t(`Up to 7 views — ${dropped.length} left out`, `Maksimal 7 sudut — ${dropped.length} tidak dipakai`))
    setCapture(next); setMasks(null); setSegInfo(null)
  }
  function onRemoveView(i) { setCapture(c => removeView(c, i)); setMasks(null); setSegInfo(null) }
  useEffect(() => { document.documentElement.lang = locale }, [locale])
  useEffect(() => { window.scrollTo({ top: 0 }) }, [run?.kind === 'full', !!roomGraph])

  const flash = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2800)
  }, [])

  // ---------- pipeline ----------
  async function design({ id, cap, segMasks, kind }) {
    setRun(r => ({ ...(r || { startedAt: Date.now() }), kind, step: 'designing' }))
    const s = useRoomStore.getState()
    let graph
    try {
      const current = s.roomGraph
      const sameRoom = kind === 'restyle' && current?.room?.type === s.selectedRoom
      graph = await designRoom({
        capture: cap, masks: segMasks, roomType: s.selectedRoom, style: s.selectedStyle, locale: s.locale, budgetIDR: s.budget || undefined,
        knownDims: sameRoom ? current.room.dimensions : (s.roomSize || undefined),
        sizeSource: sameRoom ? (current.room.size || 'estimated') : undefined,
        withViews: kind === 'full',
      })
    } catch (e) {
      if (id === runId.current) setRun(null)
      return
    }
    if (id !== runId.current) return
    setRun(r => r && { ...r, step: 'building' })
    if (kind === 'full') setDesignId(null) // a new design gets its own saved record
    else {
      // a restyle keeps the record, so its stored render no longer matches
      const savedId = useRoomStore.getState().designId
      if (savedId) deleteDesignRender(savedId).catch(() => { /* no render stored */ })
    }
    setRoomGraph(graph)
    setSelectedId(null)
    setRender(null)
    setRun(null)
    if (graph._fallbackReason) flash(t('Live AI failed — showing a demo design.', 'AI gagal — menampilkan desain demo.'))
  }

  // AI features need an account (when the server has a Meta key): ask to log in,
  // then continue with what the user clicked.
  function requireAuth(reason, action) {
    if (live && !user) { setAuthModal({ mode: 'register', reason, pending: action }); return }
    if (live && !user.emailVerified) { setVerifyModal({ sent: false, resendIn: 0, pending: action }); return }
    action()
  }
  // Stop before starting an AI step the balance cannot cover (the server checks too).
  function withCredits(need, action) {
    if (live && credits && credits.remaining < need) { setCreditsModal({ need }); return }
    action()
  }
  const costs = live && credits ? { photoDesign: ROUTE_COSTS.segment + ROUTE_COSTS.design, videoDesign: ROUTE_COSTS.segment + ROUTE_COSTS.design + ROUTE_COSTS.views, design: ROUTE_COSTS.design, render: ROUTE_COSTS.render, market: ROUTE_COSTS.market } : null

  const generate = () => requireAuth(t('Create a free account to design your room with AI.', 'Buat akun gratis untuk mendesain ruanganmu dengan AI.'),
    () => withCredits(!capture ? ROUTE_COSTS.design : ROUTE_COSTS.segment + ROUTE_COSTS.design + (viewCount(capture) > 1 ? ROUTE_COSTS.views : 0), runGenerate))
  async function runGenerate() {
    const id = ++runId.current
    setMasks(null); setSegInfo(null)
    setRun({ kind: 'full', step: capture ? 'segmenting' : 'designing', startedAt: Date.now() })
    let segMasks = null
    if (capture) {
      let seg
      try { seg = await segmentRoom(capture) } catch { if (id === runId.current) setRun(null); return }
      if (id !== runId.current) return
      setMasks(seg.masks); setSegInfo(seg)
      segMasks = seg.masks
    }
    await design({ id, cap: capture, segMasks, kind: 'full' })
  }

  // Changing style/room re-runs only Muse Spark (segmentation is reused).
  function restyle(opts) {
    requireAuth(t('Log in to redesign with AI.', 'Masuk untuk mendesain ulang dengan AI.'), () => withCredits(ROUTE_COSTS.design, () => runRestyle(opts)))
  }
  function runRestyle({ style, room }) {
    if (style) setSelectedStyle(style)
    if (room) setSelectedRoom(room)
    const id = ++runId.current
    design({ id, cap: capture, segMasks: masks, kind: 'restyle' })
  }

  function cancel() { runId.current++; setRun(null) }
  function newDesign() {
    runId.current++
    setRun(null); setRoomGraph(null); setDesignId(null); setSelectedId(null); setRender(null); setMasks(null); setSegInfo(null); setDrawer(null)
    lastSaved.current = ''
    setSaveState('idle')
  }

  // ---------- account ----------
  function onAuthed(u, mode, verification) {
    const pending = authModal?.pending
    setUser(u)
    setAuthModal(null)
    // Email + password accounts: AI (and its credits) unlock after the emailed code.
    if (live && !u.emailVerified && (mode === 'register' || pending)) {
      setVerifyModal({ sent: !!verification?.sent, resendIn: verification?.resendIn || 0, pending })
      return
    }
    flash(mode === 'register' ? t(`Welcome, ${u.name}!`, `Selamat datang, ${u.name}!`) : t(`Logged in as ${u.name}`, `Masuk sebagai ${u.name}`))
    if (pending) setTimeout(pending, 0)
  }
  function onVerified(u) {
    const pending = verifyModal?.pending
    setUser(u)
    setVerifyModal(null)
    flash(t('Email verified — your 30 AI credits are ready.', 'Email terverifikasi — 30 kredit AI siap dipakai.'))
    if (pending) setTimeout(pending, 0)
  }
  async function logout() {
    try { await apiLogout() } catch { /* session already gone */ }
    setUser(null); setDesignId(null); setDesignsOpen(false)
    lastSaved.current = ''
    setSaveState('idle')
    flash(t('Logged out', 'Kamu sudah keluar'))
  }
  async function openDesign(id) {
    const d = await getDesign(id)
    runId.current++
    setRun(null); setCapture(null); setMasks(null); setSegInfo(null); setSelectedId(null)
    setRender(d.render ? { url: d.render.url, at: Date.parse(d.render.at), type: d.render.type, savedTo: d.id } : null)
    setSelectedRoom(d.graph.room.type); setSelectedStyle(d.graph.style.name)
    lastSaved.current = JSON.stringify(d.graph)
    setRoomGraph(d.graph); setDesignId(d.id); setSaveState('saved')
    setDesignsOpen(false)
    flash(t(`Opened: ${d.title}`, `Dibuka: ${d.title}`))
  }

  // Save a design to the account; resolves to its id (null if saving failed).
  // Saves run one after another so an autosave and a render can't create two records.
  function persist(graph) {
    const save = async () => {
      const json = JSON.stringify(graph)
      let id = useRoomStore.getState().designId
      if (id && json === lastSaved.current) return id
      setSaveState('saving')
      try {
        if (id) {
          try { await updateDesign(id, graph) } catch (e) { if (e.status !== 404) throw e; id = null }
        }
        if (!id) { id = (await createDesign(graph)).id; setDesignId(id) }
        lastSaved.current = json
        setSaveState('saved')
        return id
      } catch { setSaveState('error'); return null }
    }
    const next = (saving.current || Promise.resolve()).then(save, save)
    saving.current = next
    return next
  }
  // The AI render is stored with the saved design, so make sure it exists first.
  const ensureSaved = () => (user && roomGraph ? persist(roomGraph) : Promise.resolve(null))

  // Auto-save the current design to the account (debounced, only real changes).
  useEffect(() => {
    if (!user || !roomGraph || run) return
    if (JSON.stringify(roomGraph) === lastSaved.current) return
    const timer = setTimeout(() => persist(roomGraph), 1200)
    return () => clearTimeout(timer)
  }, [user, roomGraph, run])

  // ---------- editing ----------
  function onMove(id, patch) {
    updateRoomGraph(g => {
      if (!g) return g
      const safe = { ...patch }
      if (safe.pos) safe.pos = clampPosToRoom(safe.pos, g.room.dimensions)
      return updateItem(g, id, safe)
    })
  }
  function onRemove(id) {
    const it = roomGraph?.layout.placedItems.find(i => i.id === id)
    updateRoomGraph(g => removeItem(g, id))
    if (selectedId === id) setSelectedId(null)
    if (it) flash(t(`Removed: ${it.name}`, `Dihapus: ${it.name}`))
  }
  function onPick(product) {
    if (drawer?.type === 'swap') {
      updateRoomGraph(g => swapProduct(g, drawer.item.id, product))
      flash(t(`Swapped to ${product.title}`, `Diganti dengan ${product.title}`))
    } else {
      updateRoomGraph(g => addProduct(g, product, { roomType: g?.room?.type || selectedRoom, style: g?.style?.name || selectedStyle }))
      flash(t(`Added: ${product.title}`, `Ditambahkan: ${product.title}`))
    }
    setDrawer(null)
  }

  function exportCsv() {
    if (!roomGraph) return
    const rows = [['product', 'type', 'store', 'price_idr', 'price_source', 'product_url']]
    for (const it of roomGraph.layout.placedItems) rows.push([it.name, it.archetype, it.store || '', it.priceIDR, it.priceSource, it.url || ''])
    rows.push(['TOTAL', '', '', roomGraph.layout.budget.totalIDR, '', ''])
    downloadText(rows.map(r => r.map(csvCell).join(',')).join('\n'), `tataloka-${roomGraph.room.type}-${roomGraph.style.name}.csv`.toLowerCase(), 'text/csv')
  }

  async function print() {
    const shot = (await takeSnapshot().catch(() => null)) || lastShot || null
    setPrintShot(shot)
    // Print once the board's pictures (AI render, product photos) have loaded.
    setTimeout(async () => {
      await imagesLoaded(document.querySelector('.print-sheet'))
      window.print()
    }, 50)
  }

  // ---------- assistant ----------
  async function handleCommand(cmd) {
    const roomType = roomGraph?.room?.type || selectedRoom
    const style = roomGraph?.style?.name || selectedStyle
    switch (cmd.action) {
      case 'change_style':
        if (!STYLE_IDS.includes(cmd.style)) break
        if (!roomGraph) { setSelectedStyle(cmd.style); return t(`Style set to ${cmd.style}.`, `Gaya diatur ke ${getStyle(cmd.style).label.id}.`) }
        restyle({ style: cmd.style })
        return t(`Redesigning in ${cmd.style} style…`, `Mendesain ulang dengan gaya ${getStyle(cmd.style).label.id}…`)
      case 'change_room': {
        if (!ROOM_IDS.includes(cmd.room)) break
        const r = getRoom(cmd.room)
        if (!roomGraph) { setSelectedRoom(cmd.room); return t(`Room set to ${r.label.en}.`, `Ruang diatur ke ${r.label.id}.`) }
        restyle({ room: cmd.room })
        return t(`Designing a ${r.label.en.toLowerCase()}…`, `Mendesain ${r.label.id.toLowerCase()}…`)
      }
      case 'search':
        setDrawer({ type: 'add', query: cmd.query || '' })
        return t(`Showing products for “${cmd.query}”.`, `Menampilkan produk untuk “${cmd.query}”.`)
      case 'add_item': {
        const p = bestProductFor(cmd.archetype, style, roomType, { exclude: (roomGraph?.layout.placedItems || []).map(i => i.productId) })
        if (!p) break
        updateRoomGraph(g => addProduct(g, p, { roomType, style }))
        return t(`Added ${p.title} (${p.priceIDR ? formatIDR(p.priceIDR) : 'price on store page'}).`, `${p.title} (${p.priceIDR ? formatIDR(p.priceIDR) : 'harga di toko'}) ditambahkan.`)
      }
      case 'remove_item': {
        const target = [...(roomGraph?.layout?.placedItems || [])].reverse().find(it => it.archetype === cmd.archetype)
        if (!target) return t(`There is no ${archLabel(cmd.archetype, 'en').toLowerCase()} in the room.`, `Tidak ada ${archLabel(cmd.archetype, 'id').toLowerCase()} di ruangan.`)
        onRemove(target.id)
        return t(`Removed ${target.name}.`, `${target.name} dihapus.`)
      }
      case 'budget': {
        const b = roomGraph?.layout?.budget
        if (!b) return t('No design yet.', 'Belum ada desain.')
        return t(`Total ${formatIDR(b.totalIDR)} for ${roomGraph.layout.placedItems.length} products${budget ? ` (budget ${formatIDR(budget)})` : ''}.`,
          `Total ${formatIDR(b.totalIDR)} untuk ${roomGraph.layout.placedItems.length} produk${budget ? ` (budget ${formatIDR(budget)})` : ''}.`)
      }
      case 'reset':
        newDesign()
        return t('Started a new design.', 'Memulai desain baru.')
      default:
    }
    return cmd.reply || t('Try: “make it Scandinavian”, “add a lamp”, “find a wooden table” or “what is the total?”', 'Coba: “ganti gaya Skandinavia”, “tambah lampu”, “cari meja kayu”, atau “berapa totalnya?”')
  }

  const stage = run?.kind === 'full' ? 'running' : roomGraph ? 'results' : 'setup'

  // ---------- phone tab bar ----------
  const closeSheets = () => { setDesignsOpen(false); setCreditsModal(null); setAccountOpen(false); setDrawer(null) }
  const activeTab = designsOpen ? 'saved' : creditsModal ? 'credits' : accountOpen ? 'account' : 'design'
  function tabDesign() {
    const wasOnDesign = activeTab === 'design'
    closeSheets()
    if (wasOnDesign) window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function tabSaved() {
    closeSheets()
    if (user) setDesignsOpen(true)
    else setAuthModal({ mode: 'login', reason: t('Log in to see your saved designs.', 'Masuk untuk melihat desain tersimpanmu.'), pending: () => setDesignsOpen(true) })
  }
  function tabCredits() { closeSheets(); setCreditsModal({}) }
  function tabAccount() { closeSheets(); setAccountOpen(true) }
  const assistantContext = roomGraph
    ? { room: roomGraph.room.type, style: roomGraph.style.name, items: roomGraph.layout.placedItems.map(i => i.name), totalIDR: roomGraph.layout.budget.totalIDR, budgetIDR: budget }
    : { room: selectedRoom, style: selectedStyle, items: [] }

  return (
    <>
      <div className={`app stage-${stage} ${stage === 'results' ? 'has-fab' : ''}`}>
        <header className="topbar">
          <div className="container topbar-inner">
            <button className="brand" onClick={() => { if (stage !== 'results') window.location.href = '/' }} style={{ cursor: stage === 'results' ? 'default' : 'pointer' }} title={stage === 'results' ? undefined : t('Home', 'Beranda')}>
              <span className="brand-mark"><Icon name="logo" size={18} /></span>Tataloka<small>{t('Arrange your room with AI', 'Tata ruangmu dengan AI')}</small>
            </button>
            <div className="topbar-actions">
              {health.checked && (
                <span className="status-pill hide-mobile" title={live ? t('Connected to the Meta Model API', 'Terhubung ke Meta Model API') : t('No META_API_KEY on the server', 'Tanpa META_API_KEY di server')}>
                  <span className={`dot ${live ? 'ok' : ''}`} />{live ? 'Meta AI' : t('Demo mode', 'Mode demo')}
                </span>
              )}
              <div className="segmented hide-mobile" role="group" aria-label="Language">
                {['en', 'id'].map(l => <button key={l} className={locale === l ? 'active' : ''} aria-pressed={locale === l} onClick={() => setLocale(l)}>{l.toUpperCase()}</button>)}
              </div>
              {user && credits && live && <CreditsChip credits={credits} locale={locale} onClick={() => setCreditsModal({})} />}
              <div className="hide-mobile topbar-account">
              {user ? (
                <UserMenu user={user} locale={locale} credits={live ? credits : null} onCredits={() => setCreditsModal({})} onMyDesigns={() => setDesignsOpen(true)} onLogout={logout} />
              ) : user === null ? (
                <>
                  <button className="btn btn-ghost btn-sm hide-sm" onClick={() => setAuthModal({ mode: 'login' })}>{t('Log in', 'Masuk')}</button>
                  <button className="btn btn-primary btn-sm" onClick={() => setAuthModal({ mode: 'register' })}>{t('Sign up', 'Daftar')}</button>
                </>
              ) : null}
              </div>
            </div>
          </div>
        </header>

        {live && user && !user.emailVerified && (
          <div className="verify-banner" role="status">
            <div className="container verify-banner-inner">
              <Icon name="message" size={18} />
              <span>{t(`Verify ${user.email} to unlock your 30 free AI credits.`, `Verifikasi ${user.email} untuk mengaktifkan 30 kredit AI gratismu.`)}</span>
              <button className="btn btn-primary btn-sm" onClick={() => setVerifyModal({ sent: false, resendIn: 0 })}>{t('Verify', 'Verifikasi')}</button>
            </div>
          </div>
        )}
        {stage === 'setup' && (
          <SetupView locale={locale} room={selectedRoom} style={selectedStyle} budget={budget} capture={capture} live={live}
            onRoom={setSelectedRoom} onStyle={setSelectedStyle} onBudget={setBudget}
            roomSize={roomSize} onRoomSize={setRoomSize} onAddViews={onAddViews} onRemoveView={onRemoveView}
            onClearCapture={() => { setCapture(null); setMasks(null); setSegInfo(null) }}
            onGenerate={generate} needsLogin={live && user === null} costs={costs} />
        )}
        {stage === 'running' && (
          <GeneratingView locale={locale} capture={capture} views={viewCount(capture)} roomSize={roomSize} masks={masks} step={run.step} live={live} startedAt={run.startedAt} onCancel={cancel} />
        )}
        {stage === 'results' && (
          <ResultsView roomGraph={roomGraph} capture={capture} masks={masks} segInfo={segInfo} live={live} locale={locale} budget={budget}
            busy={run?.kind === 'restyle'} selectedId={selectedId} onSelect={setSelectedId} onMove={onMove} onRemove={onRemove}
            onSwap={item => setDrawer({ type: 'swap', item })} onAdd={() => setDrawer({ type: 'add' })}
            onRestyle={style => restyle({ style })} onNew={newDesign} onPrint={print} onExportCsv={exportCsv}
            onResize={dims => { updateRoomGraph(g => resizeRoom(g, dims)); flash(t(`Room size set to ${dims.w} × ${dims.l} m`, `Ukuran ruangan diubah ke ${dims.w} × ${dims.l} m`)) }}
            render={render} setRender={setRender} onShot={setLastShot}
            costs={costs} ensureSaved={ensureSaved} user={user} saveState={saveState} onLoginToSave={() => setAuthModal({ mode: 'register', reason: t('Create a free account to save this design.', 'Buat akun gratis untuk menyimpan desain ini.') })} />
        )}

        <footer className="footer">
          <div className="container">
            <span>Tataloka — {t('from “tata” (arrange) + “loka” (place)', 'dari “tata” + “loka” (ruang/tempat)')} · {t('built with the Meta Model API', 'dibangun dengan Meta Model API')} — SAM 3.1 · Muse Spark · Muse Image · Muse Voice</span>
            <span><a className="link" href="/privacy">{t('Privacy', 'Privasi')}</a> · <a className="link" href="/terms">{t('Terms', 'Ketentuan')}</a> · {t('Product data: IKEA Indonesia', 'Data produk: IKEA Indonesia')}{CATALOG_META.fetchedAt ? ` (${priceDateLabel(CATALOG_META.fetchedAt, locale)})` : ''} · {t('marketplace listings via Meta web search', 'listing marketplace via pencarian web Meta')}</span>
          </div>
        </footer>

        {stage === 'results' && <AssistantDock locale={locale} live={live} context={assistantContext} onCommand={handleCommand}
          locked={live && !user} onLocked={() => setAuthModal({ mode: 'login', reason: t('Log in to talk to the design assistant.', 'Masuk untuk memakai asisten desain.') })} />}
        {drawer && (
          <CatalogDrawer mode={drawer} room={roomGraph?.room?.type || selectedRoom} style={roomGraph?.style?.name || selectedStyle} live={live} locale={locale}
            initialQuery={drawer.query || ''} onClose={() => setDrawer(null)} onPick={onPick} costs={costs} />
        )}
        {authModal && (
          <AuthModal key={authModal.mode + (authModal.error || '')} initialMode={authModal.mode} reason={authModal.reason} initialError={authModal.error}
            googleEnabled={!!health.auth?.google} locale={locale} onClose={() => setAuthModal(null)} onAuthed={onAuthed}
            onBeforeGoogle={() => stashCapture(capture)} />
        )}
        {verifyModal && user && <VerifyEmail locale={locale} email={user.email} sent={verifyModal.sent} resendIn={verifyModal.resendIn}
          onVerified={onVerified} onClose={() => setVerifyModal(null)} />}
        {creditsModal && <CreditsModal locale={locale} need={creditsModal.need} onClose={() => setCreditsModal(null)} />}
        {designsOpen && <MyDesignsDrawer locale={locale} currentId={designId} onOpen={openDesign} onClose={() => setDesignsOpen(false)}
          onDeleted={id => { if (id === designId) setDesignId(null) }} />}
        {accountOpen && (
          <AccountSheet locale={locale} setLocale={setLocale} user={user} live={live} credits={live ? credits : null}
            canInstall={!!installPrompt} onInstall={install} onClose={() => setAccountOpen(false)}
            onVerify={() => { setAccountOpen(false); setVerifyModal({ sent: false, resendIn: 0 }) }}
            onLogin={() => { setAccountOpen(false); setAuthModal({ mode: 'login' }) }}
            onRegister={() => { setAccountOpen(false); setAuthModal({ mode: 'register' }) }}
            onSaved={() => { setAccountOpen(false); setDesignsOpen(true) }}
            onCredits={() => { setAccountOpen(false); setCreditsModal({}) }}
            onLogout={() => { setAccountOpen(false); logout() }} />
        )}
        {toast && <div className="toast" role="status"><Icon name="check" size={16} />{toast}</div>}
        <MobileNav locale={locale} active={activeTab} user={user} credits={user && live ? credits : null}
          onDesign={tabDesign} onSaved={tabSaved} onCredits={tabCredits} onAccount={tabAccount} />
      </div>
      <PrintSheet roomGraph={roomGraph} shot={printShot} render={render} photo={render && capture?.url} locale={locale} />
    </>
  )
}
