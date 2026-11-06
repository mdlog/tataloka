import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { verifyEmail, resendVerification } from '../lib/auth.js'
import { authErrorText } from '../lib/authErrors.js'

// "Check your email": the 6-digit code from the verification email (the email's link works too).
// `sent` = a code was just emailed (right after sign-up); otherwise the user asks for one first.
export default function VerifyEmail({ locale = 'en', email, sent = false, resendIn = 0, onVerified, onClose }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const [step, setStep] = useState(sent ? 'enter' : 'ask')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [wait, setWait] = useState(sent ? resendIn : 0)
  const inputRef = useRef(null)

  useEffect(() => { if (step === 'enter') inputRef.current?.focus() }, [step])
  useEffect(() => {
    if (wait <= 0) return
    const id = setTimeout(() => setWait(w => w - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const message = (err) => authErrorText(err.code, locale) || err.message

  async function submit(e) {
    e?.preventDefault()
    if (code.length !== 6 || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      onVerified(await verifyEmail(code))
    } catch (err) {
      setError(message(err))
      if (err.code === 'code_expired' || err.code === 'code_locked') setCode('')
      setBusy(false)
    }
  }

  async function send() {
    setBusy(true); setError(''); setNotice('')
    try {
      const r = await resendVerification(locale)
      if (r.user?.emailVerified) return onVerified(r.user) // verified meanwhile (e.g. by the link)
      setStep('enter'); setCode('')
      setWait(r.verification?.resendIn || 60)
      setNotice(r.verification?.sent === false
        ? t('The email could not be sent — try again in a minute.', 'Email gagal dikirim — coba lagi sebentar lagi.')
        : t(`New code sent to ${email}.`, `Kode baru dikirim ke ${email}.`))
    } catch (err) {
      if (err.code === 'resend_too_soon') { setStep('enter'); setWait(60) }
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  // Typing or pasting: digits only, and a full code verifies right away.
  function onCode(v) {
    const digits = v.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    setError('')
  }
  useEffect(() => { if (code.length === 6 && step === 'enter') submit() }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal verify-modal" role="dialog" aria-modal="true" aria-labelledby="verify-title">
        <button className="btn btn-ghost btn-icon modal-close" onClick={onClose} aria-label={t('Close', 'Tutup')}><Icon name="x" /></button>
        <div className="verify-icon"><Icon name="message" size={24} /></div>
        <h2 id="verify-title" className="display h3-display">{t('Verify your email', 'Verifikasi emailmu')}</h2>
        {step === 'ask' ? (
          <>
            <p className="small muted verify-lead">
              {t(`Your 30 free AI credits unlock once you confirm ${email}. We’ll email you a 6-digit code.`,
                `30 kredit AI gratismu aktif setelah kamu mengonfirmasi ${email}. Kami akan mengirim kode 6 digit ke email itu.`)}
            </p>
            {error && <div className="notice notice-error" role="alert"><Icon name="alert" />{error}</div>}
            <button className="btn btn-primary btn-lg btn-block" onClick={send} disabled={busy}>
              {busy ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : t('Send the code', 'Kirim kode')}
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => setStep('enter')}>{t('I already have a code', 'Saya sudah punya kode')}</button>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <p className="small muted verify-lead">
              {t(`Enter the 6-digit code we sent to ${email} — or tap the button in that email.`,
                `Masukkan kode 6 digit yang kami kirim ke ${email} — atau ketuk tombol di email itu.`)}
            </p>
            <input ref={inputRef} className="input code-input" value={code} onChange={e => onCode(e.target.value)}
              inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="••••••"
              aria-label={t('6-digit code', 'Kode 6 digit')} disabled={busy} />
            {notice && !error && <div className="notice notice-info" role="status"><Icon name="check" />{notice}</div>}
            {error && <div className="notice notice-error" role="alert"><Icon name="alert" />{error}</div>}
            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy || code.length !== 6}>
              {busy ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : t('Verify', 'Verifikasi')}
            </button>
            <p className="tiny muted verify-foot">
              {t('No email? Check spam or promotions. ', 'Tidak ada email? Cek folder spam atau promosi. ')}
              {wait > 0
                ? <span>{t(`Send again in ${wait}s`, `Kirim ulang dalam ${wait} dtk`)}</span>
                : <button type="button" className="link" onClick={send} disabled={busy}>{t('Send a new code', 'Kirim kode baru')}</button>}
            </p>
          </form>
        )}
        <button className="btn btn-ghost btn-block verify-later" onClick={onClose}>{t('Later', 'Nanti saja')}</button>
      </div>
    </>
  )
}
