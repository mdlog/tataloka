import React, { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { Avatar } from './UserMenu.jsx'

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

// Manual steps for when the browser offers no install dialog (iOS, already used, dismissed, other browsers).
function installSteps(t) {
  const ua = navigator.userAgent
  if (isIOS()) {
    return /CriOS/i.test(ua)
      ? t('In Chrome, tap Share (the square with an arrow) in the address bar, then “Add to Home Screen”.', 'Di Chrome, ketuk Bagikan (kotak dengan panah) di address bar, lalu “Tambahkan ke Layar Utama”.')
      : t('In Safari, tap Share, then “Add to Home Screen”.', 'Di Safari, ketuk Bagikan, lalu “Tambahkan ke Layar Utama”.')
  }
  if (/android/i.test(ua)) return t('Open the browser menu ⋮ (top right), then “Install app” or “Add to Home screen”.', 'Buka menu browser ⋮ (kanan atas), lalu “Instal aplikasi” atau “Tambahkan ke layar utama”.')
  return t('Click the install icon at the right of the address bar, or open the browser menu ⋮ → “Install Tataloka”.', 'Klik ikon instal di kanan address bar, atau buka menu browser ⋮ → “Instal Tataloka”.')
}

// "Account" tab on phones: profile, language, install, legal links, log out.
export default function AccountSheet({ locale, setLocale, user, live, credits, canInstall, onInstall, onLogin, onRegister, onSaved, onCredits, onLogout, onClose }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // null → not asked yet; 'asking' while the browser's dialog is open; then onInstall's outcome
  const [installState, setInstallState] = useState(null)
  const offerInstall = !isStandalone()
  async function installClick() {
    setInstallState('asking')
    setInstallState(await onInstall())
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal sheet account-sheet" role="dialog" aria-modal="true" aria-label={t('Account', 'Akun')}>
        <button className="btn btn-ghost btn-icon modal-close" onClick={onClose} aria-label={t('Close', 'Tutup')}><Icon name="x" /></button>
        {user ? (
          <div className="account-head">
            <Avatar user={user} size={52} />
            <div style={{ minWidth: 0 }}>
              <div className="account-name">{user.name}</div>
              <div className="small muted account-email">{user.email}</div>
            </div>
          </div>
        ) : (
          <div className="account-guest">
            <div className="modal-brand"><span className="brand-mark"><Icon name="logo" size={20} /></span></div>
            <h2 className="display h3-display">{t('Welcome to Tataloka', 'Selamat datang di Tataloka')}</h2>
            <p className="small muted" style={{ marginTop: 6 }}>{t('Log in to design with AI and keep your designs — it’s free.', 'Masuk untuk mendesain dengan AI dan menyimpan desainmu — gratis.')}</p>
            <div className="account-cta">
              <button className="btn btn-primary btn-lg" onClick={onRegister}>{t('Create free account', 'Buat akun gratis')}</button>
              <button className="btn btn-secondary btn-lg" onClick={onLogin}>{t('Log in', 'Masuk')}</button>
            </div>
          </div>
        )}

        <div className="list-group">
          {user && (
            <button className="list-row" onClick={onSaved}><Icon name="layers" /><span>{t('My designs', 'Desain saya')}</span><Icon name="chevronRight" size={18} className="list-chevron" /></button>
          )}
          {user && credits && (
            <button className="list-row" onClick={onCredits}><Icon name="wallet" /><span>{t('Credits', 'Kredit')}</span><em>{credits.remaining} {t('left', 'tersisa')}</em><Icon name="chevronRight" size={18} className="list-chevron" /></button>
          )}
          <div className="list-row">
            <Icon name="globe" /><span>{t('Language', 'Bahasa')}</span>
            <div className="segmented" role="group" aria-label="Language">
              {['id', 'en'].map(l => <button key={l} className={locale === l ? 'active' : ''} aria-pressed={locale === l} onClick={() => setLocale(l)}>{l === 'id' ? 'Indonesia' : 'English'}</button>)}
            </div>
          </div>
          <div className="list-row">
            <Icon name="sparkles" /><span>{t('AI status', 'Status AI')}</span>
            <em><span className={`dot ${live ? 'ok' : ''}`} style={{ display: 'inline-block', marginRight: 6 }} />{live ? t('Meta AI connected', 'Meta AI terhubung') : t('Demo mode', 'Mode demo')}</em>
          </div>
        </div>

        {offerInstall && (
          <div className="install-card" aria-live="polite">
            <Icon name={installState === 'accepted' ? 'check' : 'install'} size={22} />
            <div>
              <strong>{installState === 'accepted' ? t('Tataloka is installed', 'Tataloka sudah terpasang') : t('Install the app', 'Pasang aplikasi')}</strong>
              <span>{installState === 'accepted'
                ? t('Open it from your home screen.', 'Buka dari layar utama.')
                : canInstall && !installState
                  ? t('Add Tataloka to your home screen — opens full screen, like an app.', 'Tambahkan Tataloka ke layar utama — terbuka layar penuh, seperti aplikasi.')
                  : (installState === 'asking' ? t('No install window? ', 'Jendela instal tidak muncul? ') : '') + installSteps(t)}</span>
            </div>
            {canInstall && !installState && <button className="btn btn-brand btn-sm" onClick={installClick}>{t('Install', 'Pasang')}</button>}
          </div>
        )}

        <div className="list-group">
          <a className="list-row" href="/"><Icon name="home" /><span>{t('About Tataloka', 'Tentang Tataloka')}</span><Icon name="chevronRight" size={18} className="list-chevron" /></a>
          <a className="list-row" href="/privacy"><Icon name="eye" /><span>{t('Privacy Policy', 'Kebijakan Privasi')}</span><Icon name="chevronRight" size={18} className="list-chevron" /></a>
          <a className="list-row" href="/terms"><Icon name="info" /><span>{t('Terms of Service', 'Ketentuan Layanan')}</span><Icon name="chevronRight" size={18} className="list-chevron" /></a>
        </div>

        {user && <button className="btn btn-secondary btn-block btn-lg account-logout" onClick={onLogout}><Icon name="arrowLeft" size={16} />{t('Log out', 'Keluar')}</button>}
        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 14 }}>Tataloka · {t('built with the Meta Model API', 'dibangun dengan Meta Model API')}</p>
      </div>
    </>
  )
}
