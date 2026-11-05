import React, { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { getCredits } from '../lib/auth.js'
import { ACTIONS, planOf } from '../data/plans.js'

const dateLabel = (iso, locale, opts = { day: 'numeric', month: 'short' }) =>
  new Date(iso).toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-GB', { timeZone: 'Asia/Jakarta', ...opts })

const ACTION_LABEL = {
  segment: { en: 'Photo analysis (SAM 3.1)', id: 'Analisis foto (SAM 3.1)' },
  design: { en: 'AI design (Muse Spark)', id: 'Desain AI (Muse Spark)' },
  render: { en: 'AI render (Muse Image)', id: 'Render AI (Muse Image)' },
  market: { en: 'Marketplace search', id: 'Cari di marketplace' },
  grant: { en: 'Bonus credits', id: 'Kredit bonus' },
}
function historyLabel(action, locale) {
  const refund = action.startsWith('refund:')
  const base = ACTION_LABEL[refund ? action.slice(7) : action]?.[locale] || action
  return refund ? `${locale === 'id' ? 'Dikembalikan' : 'Refunded'} · ${base}` : base
}

// Balance in the top bar.
export function CreditsChip({ credits, locale, onClick }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const low = credits.remaining < 3
  return (
    <button className={`credit-chip ${low ? 'low' : ''}`} onClick={onClick}
      title={t('Your AI credits', 'Kredit AI kamu')} aria-label={t(`${credits.remaining} credits left`, `Sisa ${credits.remaining} kredit`)}>
      <Icon name="sparkles" size={15} /><strong>{credits.remaining}</strong><span className="hide-sm">{t('credits', 'kredit')}</span>
    </button>
  )
}

// Small "· 3 credits" hint on buttons that call the AI.
export function CostHint({ credits, locale }) {
  if (!credits) return null
  return <span className="cost-hint">{credits} {locale === 'id' ? 'kredit' : credits === 1 ? 'credit' : 'credits'}</span>
}

// Balance, what things cost, recent usage — and the "out of credits" state.
export function CreditsModal({ locale, need, onClose }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { getCredits().then(setData).catch(e => setError(e.message)) }, [])
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const c = data?.credits
  const plan = c && planOf(c.plan)
  const short = need && c && c.remaining < need
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal credits-modal" role="dialog" aria-modal="true" aria-labelledby="credits-title">
        <button className="btn btn-ghost btn-icon modal-close" onClick={onClose} aria-label={t('Close', 'Tutup')}><Icon name="x" /></button>
        <div className="eyebrow">{plan ? t(`${plan.name.en} plan`, `Paket ${plan.name.id}`) : t('Credits', 'Kredit')}</div>
        <h2 id="credits-title" className="display h3-display">{short ? t('Not enough credits', 'Kredit tidak cukup') : t('Your credits', 'Kredit kamu')}</h2>

        {error && <div className="notice notice-error" style={{ marginTop: 14 }}><Icon name="alert" /><code>{error}</code></div>}
        {!c && !error && <div style={{ display: 'grid', placeItems: 'center', padding: 32 }}><span className="spinner" /></div>}

        {c && (
          <>
            {short && (
              <div className="notice notice-warn" style={{ marginTop: 14 }}><Icon name="alert" />
                <span>{t(`This needs ${need} credits and you have ${c.remaining}. Your monthly credits refill on ${dateLabel(c.resetsAt, 'en')}.`,
                  `Aksi ini butuh ${need} kredit, sisa kreditmu ${c.remaining}. Kredit bulanan terisi lagi pada ${dateLabel(c.resetsAt, 'id')}.`)}</span>
              </div>
            )}
            <div className="credits-balance">
              <div><strong>{c.remaining}</strong><span>{t('credits left', 'kredit tersisa')}</span></div>
              <div className="meter"><div style={{ width: `${Math.min(100, ((c.monthly - c.used) / c.monthly) * 100)}%` }} /></div>
              <div className="tiny muted credits-row">
                <span>{t(`${c.monthly - c.used} of ${c.monthly} monthly credits`, `${c.monthly - c.used} dari ${c.monthly} kredit bulanan`)}{c.bonus ? t(` + ${c.bonus} bonus`, ` + ${c.bonus} bonus`) : ''}</span>
                <span>{t('Refills', 'Terisi lagi')} {dateLabel(c.resetsAt, locale)}</span>
              </div>
            </div>

            <div className="eyebrow" style={{ marginTop: 20 }}>{t('What things cost', 'Biaya per aksi')}</div>
            <ul className="credits-costs">
              {ACTIONS.map(a => (
                <li key={a.id}>
                  <span>{locale === 'id' ? a.id_ : a.en}<small>{locale === 'id' ? a.noteId : a.noteEn}</small></span>
                  <strong>{a.credits ? `${a.credits} ${t(a.credits === 1 ? 'credit' : 'credits', 'kredit')}` : t('Free', 'Gratis')}</strong>
                </li>
              ))}
            </ul>
            <p className="tiny muted" style={{ textAlign: 'left', marginTop: 8 }}>{t('If an AI call fails, its credits are refunded automatically.', 'Kalau panggilan AI gagal, kreditnya dikembalikan otomatis.')}</p>

            {data.history?.length > 0 && (
              <>
                <div className="eyebrow" style={{ marginTop: 20 }}>{t('Recent activity', 'Aktivitas terakhir')}</div>
                <ul className="credits-history">
                  {data.history.slice(0, 6).map((h, i) => (
                    <li key={i}>
                      <span>{historyLabel(h.action, locale)}<small>{dateLabel(h.at, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></span>
                      <strong className={h.amount > 0 ? 'plus' : ''}>{h.amount > 0 ? `+${h.amount}` : h.amount}</strong>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="credits-upsell">
              <div>
                <strong>{t('Need more credits?', 'Butuh kredit lebih?')}</strong>
                <span className="small muted">{t('Plus (150/month) and Pro (400/month) plans are coming soon.', 'Paket Plus (150/bulan) dan Pro (400/bulan) segera hadir.')}</span>
              </div>
              <a className="btn btn-secondary btn-sm" href="/#pricing" target="_blank" rel="noopener">{t('See plans', 'Lihat paket')}</a>
            </div>
          </>
        )}
      </div>
    </>
  )
}
