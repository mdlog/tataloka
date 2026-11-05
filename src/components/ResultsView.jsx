import React, { useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import ViewerPanel from './ViewerPanel.jsx'
import ProductList from './ProductList.jsx'
import { RoomSizeModal } from './RoomSize.jsx'
import { STYLES, getStyle } from '../data/styles.js'
import { getRoom } from '../data/rooms.js'
import { priceDateLabel } from '../lib/labels.js'

export default function ResultsView(props) {
  const { roomGraph, capture, live, locale, budget, busy, onRestyle, onNew, onPrint, onExportCsv, onResize, user, saveState, onLoginToSave, costs } = props
  const [sizeOpen, setSizeOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false) // phones: Print / CSV / New design live in an action sheet
  const fromSheet = (fn) => () => { setMoreOpen(false); fn() }
  const sizeKind = roomGraph.room.size || (roomGraph._source === 'live' ? 'estimated' : 'typical')
  const views = capture ? 1 + (capture.extras?.length || 0) : 0
  const t = (en, id) => (locale === 'id' ? id : en)
  const room = getRoom(roomGraph.room.type)
  const style = getStyle(roomGraph.style.name)
  const { w, l } = roomGraph.room.dimensions
  const isLive = roomGraph._source === 'live'
  const title = roomGraph.title || (locale === 'id' ? `${room.label.id} ${style.label.id}` : `${style.label.en} ${room.label.en.toLowerCase()}`)
  const images = useMemo(() => roomGraph.layout.placedItems.filter(i => i.image && i.archetype !== 'rug').slice(0, 4).map(i => i.image), [roomGraph])

  return (
    <main className="container results">
      <div className="results-head">
        <div>
          <div className="eyebrow">{room.label[locale] || room.label.en} · {style.label[locale] || style.id}</div>
          <div className="results-title">
            <h1 className="display h2">{title}</h1>
            <button className="btn btn-secondary btn-icon results-more" onClick={() => setMoreOpen(true)} aria-label={t('More actions', 'Aksi lainnya')} aria-haspopup="dialog">
              <Icon name="more" size={19} />
            </button>
          </div>
          <div className="meta">
            <button className={`badge badge-button ${sizeKind === 'measured' ? 'badge-ok' : ''}`} onClick={() => setSizeOpen(true)}
              title={t('Change the room size', 'Ubah ukuran ruangan')}>
              <Icon name="plan" size={13} />{w.toFixed(1)} × {l.toFixed(1)} m · {sizeKind === 'measured' ? t('measured', 'diukur') : sizeKind === 'typical' ? t('typical', 'tipikal') : t('AI estimate', 'perkiraan AI')}<Icon name="edit" size={12} />
            </button>
            <span className="badge">{roomGraph.layout.placedItems.length} {t('products', 'produk')}</span>
            {isLive
              ? <span className="badge badge-ok"><Icon name="sparkles" size={13} />{t('Designed by', 'Didesain oleh')} {roomGraph._model}</span>
              : <span className="badge badge-warn">{t('Demo design', 'Desain demo')}</span>}
            {capture && <span className="badge badge-info"><Icon name="scan" size={13} />{views > 1 ? t(`From ${views} views`, `Dari ${views} sudut`) : t('From your photo', 'Dari fotomu')}</span>}
            {user && saveState !== 'idle' ? (
              <span className={`badge ${saveState === 'error' ? 'badge-danger' : ''}`} aria-live="polite">
                {saveState === 'saving' ? <><span className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} />{t('Saving…', 'Menyimpan…')}</>
                  : saveState === 'error' ? <><Icon name="alert" size={13} />{t('Not saved', 'Gagal menyimpan')}</>
                    : <><Icon name="check" size={13} />{t('Saved to your account', 'Tersimpan di akunmu')}</>}
              </span>
            ) : !user && user === null ? (
              <button className="badge badge-brand badge-button" onClick={onLoginToSave}><Icon name="layers" size={13} />{t('Sign up to save', 'Daftar untuk menyimpan')}</button>
            ) : null}
          </div>
        </div>
        <div className="results-actions">
          <button className="btn btn-secondary" onClick={onPrint}><Icon name="printer" size={16} />{t('Print / PDF', 'Cetak / PDF')}</button>
          <button className="btn btn-secondary" onClick={onExportCsv}><Icon name="download" size={16} />CSV</button>
          <button className="btn btn-primary" onClick={onNew}><Icon name="plus" size={16} />{t('New design', 'Desain baru')}</button>
        </div>
      </div>

      <div className="restyle">
        <span className="small muted restyle-label" style={{ whiteSpace: 'nowrap' }}>{t('Restyle', 'Ganti gaya')}{costs ? ` (${costs.design} ${t('credit', 'kredit')})` : ''}:</span>
        <div className="chip-scroll">
          {STYLES.map(s => (
            <button key={s.id} className={`chip ${s.id === roomGraph.style.name ? 'active' : ''}`} disabled={busy} onClick={() => s.id !== roomGraph.style.name && onRestyle(s.id)}>
              <span className="swatches">{s.swatch.map(c => <i key={c} style={{ background: c }} />)}</span>{s.label[locale] || s.id}
            </button>
          ))}
        </div>
        {busy && <span className="small muted" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}><span className="spinner" />{live ? t('Muse Spark is redesigning…', 'Muse Spark mendesain ulang…') : t('Redesigning…', 'Mendesain ulang…')}</span>}
      </div>

      {roomGraph._fallbackReason && (
        <div className="notice notice-warn" style={{ marginBottom: 16 }}>
          <Icon name="alert" />
          <span>{t('The live AI call failed, so this is a demo design built from the real catalog.', 'Panggilan AI gagal, jadi ini desain demo dari katalog nyata.')} <code>{roomGraph._fallbackReason}</code></span>
        </div>
      )}

      <div className="workspace">
        <ViewerPanel {...props} />
        <aside className="side">
          <ProductList {...props} budget={budget} />
        </aside>
      </div>

      <div className="notes-grid">
        <section className="card card-pad">
          <div className="eyebrow">{t('Design notes', 'Catatan desain')}</div>
          {roomGraph.summary && <p className="lead" style={{ marginTop: 10 }}>{roomGraph.summary}</p>}
          {roomGraph.tips?.length > 0 && (
            <ul className="tips" style={{ marginTop: 14 }}>
              {roomGraph.tips.map((tip, i) => <li key={i}><Icon name="check" size={16} />{tip}</li>)}
            </ul>
          )}
          {roomGraph.existingFurniture?.length > 0 && (
            <>
              <div className="divider" />
              <div className="small" style={{ fontWeight: 650, marginBottom: 8 }}>{t('Already in your room', 'Sudah ada di ruanganmu')}</div>
              <div className="chip-row">
                {roomGraph.existingFurniture.map((f, i) => (
                  <span key={i} className={`badge ${f.keep ? 'badge-ok' : ''}`}>{f.label} · {f.keep ? t('keep', 'pertahankan') : t('replace', 'ganti')}</span>
                ))}
              </div>
            </>
          )}
        </section>
        <section className="card card-pad">
          <div className="eyebrow">{t('Moodboard', 'Moodboard')}</div>
          <div className="palette" style={{ margin: '12px 0 26px' }}>
            {(roomGraph.style.palette || []).slice(0, 5).map(c => <div key={c} style={{ background: c }}><span>{c}</span></div>)}
          </div>
          <div className="chip-row" style={{ marginBottom: 14 }}>
            {(roomGraph.style.materials || []).map(m => <span key={m} className="badge">{m}</span>)}
          </div>
          {images.length > 0 && <div className="moodboard">{images.map(src => <img key={src} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />)}</div>}
          {roomGraph.layout.budget.priceDate && <p className="tiny muted" style={{ marginTop: 12 }}>{t('Product data: IKEA Indonesia, as of', 'Data produk: IKEA Indonesia, per')} {priceDateLabel(roomGraph.layout.budget.priceDate, locale)}</p>}
        </section>
      </div>
      {moreOpen && (
        <>
          <div className="scrim" onClick={() => setMoreOpen(false)} />
          <div className="modal action-sheet" role="dialog" aria-modal="true" aria-label={t('Design actions', 'Aksi desain')}>
            <div className="action-sheet-title">{title}</div>
            <div className="list-group">
              <button className="list-row" onClick={fromSheet(onPrint)}><Icon name="printer" /><span>{t('Print / save as PDF', 'Cetak / simpan PDF')}</span></button>
              <button className="list-row" onClick={fromSheet(onExportCsv)}><Icon name="download" /><span>{t('Shopping list (CSV)', 'Daftar belanja (CSV)')}</span></button>
              <button className="list-row" onClick={fromSheet(() => setSizeOpen(true))}><Icon name="ruler" /><span>{t('Room size', 'Ukuran ruangan')}</span><em>{w.toFixed(1)} × {l.toFixed(1)} m</em></button>
            </div>
            <button className="btn btn-primary btn-lg btn-block action-sheet-main" onClick={fromSheet(onNew)}><Icon name="plus" size={18} />{t('New design', 'Desain baru')}</button>
            <button className="btn btn-ghost btn-lg btn-block" onClick={() => setMoreOpen(false)}>{t('Cancel', 'Batal')}</button>
          </div>
        </>
      )}
      {sizeOpen && <RoomSizeModal locale={locale} dims={roomGraph.room.dimensions} onClose={() => setSizeOpen(false)}
        onSave={dims => { setSizeOpen(false); onResize?.(dims) }} />}
    </main>
  )
}
