import React, { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { listDesigns, deleteDesign } from '../lib/auth.js'
import { formatIDR } from '../lib/roomLayout.js'
import { getRoom } from '../data/rooms.js'
import { getStyle } from '../data/styles.js'

// Slide-over with the designs saved to the user's account.
export default function MyDesignsDrawer({ locale = 'en', currentId, onOpen, onDeleted, onClose }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const [designs, setDesigns] = useState(null)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const [openingId, setOpeningId] = useState(null)

  useEffect(() => {
    listDesigns().then(setDesigns).catch(e => setError(e.message))
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function remove(id) {
    try {
      await deleteDesign(id)
      setDesigns(d => d.filter(x => x.id !== id))
      onDeleted?.(id)
    } catch (e) { setError(e.message) }
    setConfirmId(null)
  }
  const when = (ms) => new Date(ms).toLocaleString(locale === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={t('My designs', 'Desain saya')}>
        <div className="drawer-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div className="eyebrow">{t('Your account', 'Akunmu')}</div>
              <div className="h3" style={{ marginTop: 4 }}>{t('My designs', 'Desain saya')}{designs ? <span className="muted" style={{ fontWeight: 500 }}> ({designs.length})</span> : null}</div>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('Close', 'Tutup')}><Icon name="x" /></button>
          </div>
        </div>
        <div className="drawer-body">
          {error && <div className="notice notice-error" style={{ marginBottom: 12 }}><Icon name="alert" />{error}</div>}
          {!designs && !error && <div className="center-fill" style={{ position: 'static', padding: 40 }}><span className="spinner" /></div>}
          {designs && !designs.length && (
            <div className="empty-state">
              <div className="dropzone-icon"><Icon name="layers" size={22} /></div>
              <div className="h3">{t('No saved designs yet', 'Belum ada desain tersimpan')}</div>
              <div className="small muted">{t('Designs you create while logged in are saved here automatically.', 'Desain yang kamu buat saat masuk otomatis tersimpan di sini.')}</div>
            </div>
          )}
          <div className="design-list">
            {designs?.map(d => {
              const room = getRoom(d.roomType), style = getStyle(d.style)
              return (
                <article key={d.id} className={`design-card ${d.id === currentId ? 'current' : ''}`}>
                  <div className={`design-thumbs ${d.render ? 'has-render' : ''}`}>
                    {d.render
                      ? <img src={d.render.url} alt={t('AI render', 'Render AI')} loading="lazy" />
                      : (d.images.length ? d.images : [null]).slice(0, 3).map((src, i) => src
                      ? <img key={i} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      : <div key={i} className="ph"><Icon name={room.icon} /></div>)}
                  </div>
                  <div className="design-meta">
                    <div className="design-title">{d.title}</div>
                    <div className="tiny muted">{room.label[locale] || room.label.en} · {style.label[locale] || style.id} · {d.itemCount} {t('products', 'produk')}</div>
                    <div className="small" style={{ fontWeight: 700, marginTop: 4 }}>{formatIDR(d.totalIDR)}</div>
                    <div className="tiny muted">{t('Updated', 'Diperbarui')} {when(d.updatedAt)}{d.id === currentId ? ` · ${t('open now', 'sedang dibuka')}` : ''}</div>
                  </div>
                  <div className="design-actions">
                    <button className="btn btn-primary btn-sm" disabled={openingId === d.id} onClick={async () => { setOpeningId(d.id); try { await onOpen(d.id) } finally { setOpeningId(null) } }}>
                      {openingId === d.id ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : t('Open', 'Buka')}
                    </button>
                    {confirmId === d.id
                      ? <button className="btn btn-sm btn-danger" onClick={() => remove(d.id)}>{t('Delete?', 'Hapus?')}</button>
                      : <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setConfirmId(d.id)} aria-label={t('Delete design', 'Hapus desain')} title={t('Delete', 'Hapus')}><Icon name="trash" size={15} /></button>}
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </aside>
    </>
  )
}
