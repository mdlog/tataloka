import React, { useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { CostHint } from './Credits.jsx'
import { ROOMS, getRoom } from '../data/rooms.js'
import { STYLES, getStyle } from '../data/styles.js'
import { rankProducts, CATALOG, CATALOG_META } from '../data/catalog.js'
import { compressImage } from '../lib/image.js'
import { extractVideoFrames } from '../lib/video.js'
import { MAX_VIEWS, viewCount, hasVideo } from '../lib/views.js'
import { formatIDR } from '../lib/roomLayout.js'
import { RoomSizeField } from './RoomSize.jsx'

const SAMPLE_URL = '/samples/living-room.jpg'
const BUDGET_PRESETS = [10_000_000, 25_000_000, 50_000_000]

export default function SetupView({ locale, room, style, budget, roomSize, capture, live, needsLogin, costs, onRoom, onStyle, onBudget, onRoomSize, onAddViews, onRemoveView, onClearCapture, onGenerate }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const inputRef = useRef(null)  // photos and videos from the gallery / disk
  const cameraRef = useRef(null) // phones: take a photo
  const videoRef = useRef(null)  // phones: record a video
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(null) // { progress } while frames are taken from a video
  const views = capture ? [capture, ...(capture.extras || [])] : []
  const full = views.length >= MAX_VIEWS

  const videoError = (e) => e?.code === 'too_short'
    ? t('That video is too short — record at least 3 seconds while turning slowly.', 'Video terlalu pendek — rekam minimal 3 detik sambil berputar perlahan.')
    : t('This video could not be read by your browser. Record it again with the phone camera, or use photos.', 'Video ini tidak bisa dibaca browser. Rekam ulang dengan kamera HP, atau pakai foto.')

  // Photos are resized here; a video becomes ~6 sharp frames — nothing else leaves the device.
  async function handleFiles(fileList, { sample = false } = {}) {
    const files = [...(fileList || [])]
    if (!files.length) return
    setError('')
    const added = []
    for (const file of files) {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name)
      if (isVideo) {
        setProcessing({ progress: 0 })
        try {
          const frames = await extractVideoFrames(file, { count: 6, onProgress: p => setProcessing({ progress: p }) })
          added.push(...frames.map(f => ({ ...f, from: 'video', name: file.name })))
        } catch (e) { setError(videoError(e)) } finally { setProcessing(null) }
      } else if (file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) {
        try {
          const { blob, width, height } = await compressImage(file, 1024, 0.85)
          added.push({ blob, url: URL.createObjectURL(blob), width, height, name: file.name, from: 'photo', sample })
        } catch { setError(t('This image could not be read. Try a JPG or PNG.', 'Gambar tidak bisa dibaca. Coba JPG atau PNG.')) }
      } else {
        setError(t('Please choose photos or a video of the room.', 'Pilih foto atau video ruangan.'))
      }
    }
    if (added.length) onAddViews(added)
  }
  async function useSample() {
    try {
      const blob = await (await fetch(SAMPLE_URL)).blob()
      handleFiles([new File([blob], 'sample-living-room.jpg', { type: 'image/jpeg' })], { sample: true })
    } catch (e) { setError(e.message) }
  }
  const pick = (ref) => ref.current?.click()

  // Real product photos per style for the current room — a live moodboard.
  const collages = useMemo(() => {
    const types = getRoom(room).archetypes.slice(0, 3)
    return Object.fromEntries(STYLES.map(s => [s.id, types
      .map(a => rankProducts(a, { room, style: s.id }).find(p => p.image && p.styles?.includes(s.id)) || rankProducts(a, { room, style: s.id }).find(p => p.image))
      .filter(Boolean).map(p => p.image)]))
  }, [room])

  const fetched = CATALOG_META.fetchedAt ? new Date(CATALOG_META.fetchedAt).toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  return (
    <main className="container setup">
      <div className="setup-hero">
        <div>
          <div className="eyebrow">{t('AI interior design · real products', 'Desain interior AI · produk nyata')}</div>
          <h1 className="display h1" style={{ marginTop: 10 }}>{t('Redesign your room from a photo or video.', 'Desain ulang ruanganmu dari foto atau video.')}</h1>
          <p className="lead">{t('Tataloka reads your room with SAM 3.1, designs a layout with Muse Spark and furnishes it with products you can buy today — with real prices.',
            'Tataloka membaca ruanganmu dengan SAM 3.1, menyusun layout dengan Muse Spark, dan mengisinya dengan produk yang bisa dibeli hari ini — lengkap dengan harga asli.')}</p>
        </div>
        <div className="chip-row">
          <span className="badge"><Icon name="store" size={14} /> {CATALOG.length} {t('real products', 'produk nyata')}</span>
          {fetched && <span className="badge">{t('Prices as of', 'Harga per')} {fetched}</span>}
        </div>
      </div>

      <div className="setup-grid">
        <section className="card card-pad" aria-labelledby="photo-h">
          <div className="field-label"><span id="photo-h">{t('1. Photo or video of your room', '1. Foto atau video ruanganmu')}</span><span className="tiny muted">{t('Optional', 'Opsional')}</span></div>
          {processing ? (
            <div className="dropzone processing" aria-live="polite">
              <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              <div className="h3">{t('Reading your video…', 'Membaca videomu…')}</div>
              <div className="small muted">{t('Picking the sharpest frames on this device — the video is not uploaded.', 'Memilih frame tertajam di perangkat ini — videonya tidak diupload.')}</div>
              <div className="meter" style={{ width: 220 }}><div style={{ width: `${Math.round(processing.progress * 100)}%` }} /></div>
            </div>
          ) : capture ? (
            <>
              <div className="photo-preview">
                <img src={capture.url} alt={t('Main view of the room', 'Sudut utama ruangan')} />
                <div className="photo-actions">
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={onClearCapture} aria-label={t('Remove all', 'Hapus semua')} title={t('Remove all', 'Hapus semua')}><Icon name="x" size={15} /></button>
                </div>
                <span className="photo-badge">
                  <Icon name={hasVideo(capture) ? 'video' : 'image'} size={14} />
                  {views.length > 1 ? t(`${views.length} views`, `${views.length} sudut`) : t('1 photo', '1 foto')}
                </span>
              </div>
              <div className="views-strip" role="list" aria-label={t('Views of the room', 'Sudut ruangan')}>
                {views.map((v, i) => (
                  <div key={v.url} className={`view-thumb ${i === 0 ? 'main' : ''}`} role="listitem">
                    <img src={v.url} alt="" />
                    {i === 0 && <span className="view-main">{t('Main', 'Utama')}</span>}
                    <button className="view-remove" onClick={() => onRemoveView(i)} aria-label={t('Remove this view', 'Hapus sudut ini')}><Icon name="x" size={12} /></button>
                  </div>
                ))}
                {!full && (
                  <button className="view-add" onClick={() => pick(inputRef)} aria-label={t('Add photos or a video', 'Tambah foto atau video')}>
                    <Icon name="plus" size={18} /><span>{t('Add', 'Tambah')}</span>
                  </button>
                )}
              </div>
              <p className="tiny muted" style={{ marginTop: 8 }}>
                {views.length > 1
                  ? t(`The AI reads all ${views.length} views to see the whole room; the main view is used for detection and the AI render.`, `AI membaca ke-${views.length} sudut untuk melihat seluruh ruangan; sudut utama dipakai untuk deteksi dan render AI.`)
                  : t('Add a video or photos from other corners so the AI sees the whole room.', 'Tambah video atau foto dari sudut lain agar AI melihat seluruh ruangan.')}
              </p>
            </>
          ) : (
            <div className={`dropzone ${drag ? 'drag' : ''}`} role="button" tabIndex={0}
              onClick={() => pick(inputRef)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && pick(inputRef)}
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}>
              <div className="dropzone-icon"><Icon name="camera" size={24} /></div>
              <div className="h3">{t('Add a photo or video of your room', 'Tambah foto atau video ruanganmu')}</div>
              <div className="small muted only-desktop" style={{ maxWidth: 340 }}>{t('Drop photos or a video here, or click. Video: turn slowly around the room for 10–20 seconds.', 'Seret foto atau video ke sini, atau klik. Video: berputar perlahan mengelilingi ruangan 10–20 detik.')}</div>
              <div className="small muted only-mobile" style={{ maxWidth: 300 }}>{t('A video: turn slowly for 10–20 seconds. Photos: straight-on, good light, no people.', 'Video: berputar perlahan 10–20 detik. Foto: lurus dari depan, terang, tanpa orang.')}</div>
              <div className="dropzone-actions only-mobile" onClick={e => e.stopPropagation()}>
                <button className="btn btn-primary" onClick={() => pick(cameraRef)}><Icon name="camera" size={17} />{t('Photo', 'Foto')}</button>
                <button className="btn btn-primary" onClick={() => pick(videoRef)}><Icon name="video" size={17} />{t('Video', 'Video')}</button>
                <button className="btn btn-secondary" onClick={() => pick(inputRef)}><Icon name="image" size={17} />{t('Gallery', 'Galeri')}</button>
              </div>
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={e => { e.stopPropagation(); useSample() }}>
                <Icon name="image" size={15} />{t('Use a sample photo', 'Pakai foto contoh')}
              </button>
            </div>
          )}
          <input ref={inputRef} type="file" accept="image/*,video/*" multiple hidden onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
          <input ref={videoRef} type="file" accept="video/*" capture="environment" hidden onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
          {error && <div className="notice notice-error" style={{ marginTop: 12 }}><Icon name="alert" />{error}</div>}
          {!capture && !processing && <p className="small muted" style={{ marginTop: 12 }}>{t('No photo? We design a typical room of the selected type.', 'Tanpa foto? Kami mendesain ruang tipikal sesuai tipe yang dipilih.')}</p>}
          <div className="divider" />
          <RoomSizeField locale={locale} room={room} value={roomSize} onChange={onRoomSize} />
        </section>

        <section className="card card-pad" style={{ display: 'grid', gap: 26 }}>
          <div>
            <div className="field-label"><span>{t('2. Room type', '2. Tipe ruangan')}</span></div>
            <div className="room-grid">
              {ROOMS.map(r => (
                <button key={r.id} className={`room-option ${room === r.id ? 'active' : ''}`} aria-pressed={room === r.id} onClick={() => onRoom(r.id)}>
                  <Icon name={r.icon} />
                  <div><b>{r.label[locale] || r.label.en}</b><span>{r.dims.w}×{r.dims.l} m</span></div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="field-label"><span>{t('3. Style', '3. Gaya')}</span></div>
            <div className="style-grid">
              {STYLES.map(s => (
                <button key={s.id} className={`style-option ${style === s.id ? 'active' : ''}`} aria-pressed={style === s.id} onClick={() => onStyle(s.id)}>
                  <div className="style-collage">
                    {(collages[s.id] || []).map((src, i) => <img key={i} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />)}
                  </div>
                  {style === s.id && <span className="check-badge"><Icon name="check" /></span>}
                  <div className="meta">
                    <b>{s.label[locale] || s.id}<span className="swatches">{s.swatch.map(c => <i key={c} style={{ background: c }} />)}</span></b>
                    <span>{s.desc[locale] || s.desc.en}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="field-label">
              <span>{t('4. Budget', '4. Budget')}</span>
              <span className="budget-value num">{budget ? formatIDR(budget) : t('No limit', 'Tanpa batas')}</span>
            </div>
            <input type="range" min={3_000_000} max={100_000_000} step={500_000} value={budget || 100_000_000}
              onChange={e => onBudget(Number(e.target.value))} aria-label={t('Budget', 'Budget')} />
            <div className="chip-row" style={{ marginTop: 10 }}>
              {BUDGET_PRESETS.map(b => <button key={b} className={`chip ${budget === b ? 'active' : ''}`} onClick={() => onBudget(b)}>{formatIDR(b)}</button>)}
              <button className={`chip ${!budget ? 'active' : ''}`} onClick={() => onBudget(null)}>{t('No limit', 'Tanpa batas')}</button>
            </div>
          </div>

          <div className="divider" style={{ margin: 0 }} />
          <div className="generate-bar">
            <div className="small muted" style={{ maxWidth: 330 }}>
              {live
                ? (needsLogin
                  ? t('Uses SAM 3.1 + Muse Spark (20–60 s). You’ll be asked to log in or create a free account first.', 'Memakai SAM 3.1 + Muse Spark (20–60 detik). Kamu akan diminta masuk atau membuat akun gratis dulu.')
                  : t('Uses SAM 3.1 + Muse Spark. Usually 20–60 seconds.', 'Memakai SAM 3.1 + Muse Spark. Biasanya 20–60 detik.'))
                : t('Demo mode: a sample design from the real catalog. Add META_API_KEY for AI analysis.', 'Mode demo: desain contoh dari katalog nyata. Isi META_API_KEY untuk analisis AI.')}
            </div>
            <button className="btn btn-brand btn-lg" onClick={onGenerate}>
              <Icon name="sparkles" />{capture ? t('Design my room', 'Desain ruanganku') : t('Design a typical room', 'Desain ruang tipikal')}
              {costs && <CostHint credits={!capture ? costs.design : viewCount(capture) > 1 ? costs.videoDesign : costs.photoDesign} locale={locale} />}
            </button>
          </div>
        </section>
      </div>

      {/* Phones: the main action stays in reach, above the tab bar. */}
      <div className="mobile-cta">
        <div className="mobile-cta-summary">
          <b>{getRoom(room).label[locale] || getRoom(room).label.en} · {getStyle(style).label[locale] || style}</b>
          <span>{budget ? formatIDR(budget) : t('No budget limit', 'Tanpa batas budget')}{capture ? ` · ${viewCount(capture) > 1 ? t(`${viewCount(capture)} views`, `${viewCount(capture)} sudut`) : t('photo', 'foto')}` : ''}{roomSize ? ` · ${roomSize.w}×${roomSize.l} m` : ''}</span>
        </div>
        <button className="btn btn-brand btn-lg" onClick={onGenerate}>
          <Icon name="sparkles" />{t('Design', 'Desain')}
          {costs && <CostHint credits={!capture ? costs.design : viewCount(capture) > 1 ? costs.videoDesign : costs.photoDesign} locale={locale} />}
        </button>
      </div>
    </main>
  )
}
