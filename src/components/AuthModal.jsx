import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { login, register, googleUrl } from '../lib/auth.js'
import { authErrorText } from '../lib/authErrors.js'


// Login / register dialog. `reason` explains why it opened (e.g. before generating).
export default function AuthModal({ initialMode = 'login', reason, initialError, googleEnabled, locale = 'en', onClose, onAuthed, onBeforeGoogle }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const [mode, setMode] = useState(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError ? authErrorText(initialError, locale) : '')
  const firstField = useRef(null)

  useEffect(() => { firstField.current?.focus() }, [mode])
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      if (mode === 'login') onAuthed(await login(email, password), mode)
      else {
        const r = await register(name, email, password, locale)
        onAuthed(r.user, mode, r.verification) // the app then asks for the emailed code
      }
    } catch (err) {
      setError(authErrorText(err.code, locale) || err.message)
      setBusy(false)
    }
  }

  async function google() {
    setBusy(true)
    await onBeforeGoogle?.()
    window.location.href = googleUrl(window.location.pathname)
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="btn btn-ghost btn-icon modal-close" onClick={onClose} aria-label={t('Close', 'Tutup')}><Icon name="x" /></button>
        <div className="modal-brand"><span className="brand-mark"><Icon name="logo" size={18} /></span></div>
        <h2 id="auth-title" className="display h3-display">{mode === 'login' ? t('Welcome back', 'Selamat datang kembali') : t('Create your account', 'Buat akunmu')}</h2>
        <p className="small muted" style={{ marginTop: 6 }}>
          {reason || (mode === 'login'
            ? t('Log in to design with AI and keep your designs.', 'Masuk untuk mendesain dengan AI dan menyimpan desainmu.')
            : t('Free — your designs are saved to your account.', 'Gratis — desainmu tersimpan di akunmu.'))}
        </p>

        <div className="segmented auth-tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>{t('Log in', 'Masuk')}</button>
          <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>{t('Sign up', 'Daftar')}</button>
        </div>

        {googleEnabled && (
          <>
            <button type="button" className="btn btn-secondary btn-block btn-google" onClick={google} disabled={busy}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
              {t('Continue with Google', 'Lanjutkan dengan Google')}
            </button>
            <div className="or-divider"><span>{t('or with email', 'atau dengan email')}</span></div>
          </>
        )}

        <form onSubmit={submit} className="auth-form" noValidate>
          {mode === 'register' && (
            <label className="field">
              <span>{t('Name', 'Nama')}</span>
              <input ref={firstField} className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={60} placeholder={t('Your name', 'Nama kamu')} />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input ref={mode === 'login' ? firstField : undefined} className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required placeholder="nama@email.com" />
          </label>
          <label className="field">
            <span>{t('Password', 'Kata sandi')}</span>
            <div className="input-group">
              <input className="input" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} style={{ paddingLeft: 12, paddingRight: 44 }}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8}
                placeholder={mode === 'register' ? t('At least 8 characters', 'Minimal 8 karakter') : ''} />
              <button type="button" className="btn btn-ghost btn-sm btn-icon pw-toggle" onClick={() => setShowPw(v => !v)} aria-label={showPw ? t('Hide password', 'Sembunyikan kata sandi') : t('Show password', 'Tampilkan kata sandi')}>
                <Icon name="eye" size={16} />
              </button>
            </div>
          </label>
          {error && <div className="notice notice-error" role="alert"><Icon name="alert" />{error}</div>}
          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy || !email || password.length < (mode === 'register' ? 8 : 1)}>
            {busy ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : mode === 'login' ? t('Log in', 'Masuk') : t('Create account', 'Buat akun')}
          </button>
        </form>

        <p className="tiny muted" style={{ marginTop: 14, textAlign: 'center' }}>
          {mode === 'login'
            ? <>{t('New here?', 'Belum punya akun?')} <button className="link" onClick={() => { setMode('register'); setError('') }}>{t('Create an account', 'Daftar sekarang')}</button></>
            : <>{t('Already have an account?', 'Sudah punya akun?')} <button className="link" onClick={() => { setMode('login'); setError('') }}>{t('Log in', 'Masuk')}</button></>}
        </p>
        <p className="tiny muted" style={{ marginTop: 6, textAlign: 'center' }}>
          {t('We store your email, name and saved designs with their AI renders. Uploaded room photos are not stored.', 'Kami menyimpan email, nama, dan desain tersimpanmu beserta render AI-nya. Foto ruangan yang kamu upload tidak disimpan.')} <a className="link" href="/privacy" target="_blank" rel="noreferrer">{t('Privacy', 'Privasi')}</a> · <a className="link" href="/terms" target="_blank" rel="noreferrer">{t('Terms', 'Ketentuan')}</a>
        </p>
      </div>
    </>
  )
}
