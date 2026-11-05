import React, { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { measuredDims, MEASURE_LIMITS } from '../lib/roomLayout.js'
import { getRoom } from '../data/rooms.js'

// "3,5" and "3.5" both mean 3.5 m.
const parse = (v) => (String(v ?? '').trim() === '' ? NaN : Number(String(v).replace(',', '.')))
const show = (v) => (v == null ? '' : String(v))

function MeterInput({ label, value, onChange, placeholder, autoFocus }) {
  return (
    <label className="field size-input">
      <span>{label}</span>
      <div className="input-suffix">
        <input className="input" type="text" inputMode="decimal" autoComplete="off" value={value} placeholder={placeholder}
          autoFocus={autoFocus} onChange={e => onChange(e.target.value.replace(/[^0-9.,]/g, ''))} />
        <em>m</em>
      </div>
    </label>
  )
}

const limitsText = (t) => t(
  `Width ${MEASURE_LIMITS.w[0]}–${MEASURE_LIMITS.w[1]} m, length ${MEASURE_LIMITS.l[0]}–${MEASURE_LIMITS.l[1]} m.`,
  `Lebar ${MEASURE_LIMITS.w[0]}–${MEASURE_LIMITS.w[1]} m, panjang ${MEASURE_LIMITS.l[0]}–${MEASURE_LIMITS.l[1]} m.`)

// Setup: "let the AI estimate" or "I measured it" (width × length with a tape measure).
export function RoomSizeField({ locale, room, value, onChange }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const [mode, setMode] = useState(value ? 'measured' : 'auto')
  const [w, setW] = useState(show(value?.w))
  const [l, setL] = useState(show(value?.l))
  const typical = getRoom(room).dims
  const filled = w !== '' && l !== ''
  const valid = measuredDims({ w: parse(w), l: parse(l) })

  useEffect(() => {
    if (mode !== 'measured') { onChange(null); return }
    onChange(valid ? { w: valid.w, l: valid.l } : null)
  }, [mode, w, l]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="room-size">
      <div className="field-label">
        <span><Icon name="ruler" size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />{t('Room size', 'Ukuran ruangan')}</span>
        <span className="tiny muted">{t('Optional', 'Opsional')}</span>
      </div>
      <div className="segmented size-mode" role="group" aria-label={t('Room size', 'Ukuran ruangan')}>
        <button className={mode === 'auto' ? 'active' : ''} aria-pressed={mode === 'auto'} onClick={() => setMode('auto')}>{t('AI estimates', 'Perkiraan AI')}</button>
        <button className={mode === 'measured' ? 'active' : ''} aria-pressed={mode === 'measured'} onClick={() => setMode('measured')}>{t('I measured it', 'Saya ukur sendiri')}</button>
      </div>
      {mode === 'measured' ? (
        <>
          <div className="size-grid">
            <MeterInput label={t('Width', 'Lebar')} value={w} onChange={setW} placeholder={String(typical.w)} />
            <span className="size-x" aria-hidden="true">×</span>
            <MeterInput label={t('Length', 'Panjang')} value={l} onChange={setL} placeholder={String(typical.l)} />
          </div>
          <p className={`tiny ${filled && !valid ? 'size-error' : 'muted'}`} style={{ marginTop: 8 }}>
            {filled && !valid ? limitsText(t)
              : t('Wall to wall with a tape measure. Width = the wall you face when taking the photo. The design uses exactly this size.',
                'Dari dinding ke dinding dengan meteran. Lebar = dinding yang kamu hadapi saat memotret. Desain memakai ukuran ini persis.')}
          </p>
        </>
      ) : (
        <p className="tiny muted" style={{ marginTop: 8 }}>
          {t(`The AI estimates the size from your photo or video (a typical one is ${typical.w} × ${typical.l} m). For an exact plan, measure it — you can also correct it after the design.`,
            `AI memperkirakan ukuran dari foto atau video (tipikal ${typical.w} × ${typical.l} m). Untuk denah yang pas, ukur sendiri — bisa juga dikoreksi setelah desain jadi.`)}
        </p>
      )}
    </div>
  )
}

// Results: correct the room size; furniture follows the walls.
export function RoomSizeModal({ locale, dims, onSave, onClose }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const [w, setW] = useState(show(dims.w))
  const [l, setL] = useState(show(dims.l))
  const [h, setH] = useState(show(dims.h))
  const valid = measuredDims({ w: parse(w), l: parse(l), h: parse(h) })
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="modal size-modal" role="dialog" aria-modal="true" aria-labelledby="size-title"
        onSubmit={e => { e.preventDefault(); if (valid) onSave(valid) }}>
        <button type="button" className="btn btn-ghost btn-icon modal-close" onClick={onClose} aria-label={t('Close', 'Tutup')}><Icon name="x" /></button>
        <div className="eyebrow">{t('Room size', 'Ukuran ruangan')}</div>
        <h2 id="size-title" className="display h3-display">{t('Measured it? Enter the real size', 'Sudah diukur? Masukkan ukuran aslinya')}</h2>
        <p className="small muted" style={{ marginTop: 6 }}>
          {t('Wall to wall with a tape measure. Width = the wall facing the camera, length = front to back. Furniture against a wall moves with it.',
            'Dari dinding ke dinding dengan meteran. Lebar = dinding yang menghadap kamera, panjang = depan ke belakang. Furnitur yang menempel dinding ikut bergeser.')}
        </p>
        <div className="size-grid size-grid-3">
          <MeterInput label={t('Width', 'Lebar')} value={w} onChange={setW} autoFocus />
          <MeterInput label={t('Length', 'Panjang')} value={l} onChange={setL} />
          <MeterInput label={t('Height', 'Tinggi')} value={h} onChange={setH} />
        </div>
        {!valid && <p className="tiny size-error" style={{ marginTop: 8 }}>{limitsText(t)}</p>}
        <div className="size-actions">
          <button type="button" className="btn btn-secondary btn-lg" onClick={onClose}>{t('Cancel', 'Batal')}</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={!valid}>{t('Save size', 'Simpan ukuran')}</button>
        </div>
      </form>
    </>
  )
}
