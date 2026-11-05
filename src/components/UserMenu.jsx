import React, { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'
}

export function Avatar({ user, size = 32 }) {
  const [broken, setBroken] = useState(false)
  return user.avatarUrl && !broken
    ? <img className="avatar" src={user.avatarUrl} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: size, height: size }} />
    : <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initials(user.name)}</span>
}

// Account button in the top bar: avatar → menu with "My designs" and "Log out".
export default function UserMenu({ user, locale = 'en', credits, onCredits, onMyDesigns, onLogout }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = e => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div className="user-menu" ref={ref}>
      <button className="avatar-btn" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t('Account', 'Akun')}>
        <Avatar user={user} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <Avatar user={user} size={36} />
            <div style={{ minWidth: 0 }}>
              <div className="menu-name">{user.name}</div>
              <div className="tiny muted menu-email">{user.email}</div>
            </div>
          </div>
          {credits && (
            <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); onCredits() }}>
              <Icon name="sparkles" size={16} />{t('Credits', 'Kredit')}<span className="menu-meta">{credits.remaining} {t('left', 'tersisa')}</span>
            </button>
          )}
          <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); onMyDesigns() }}><Icon name="layers" size={16} />{t('My designs', 'Desain saya')}</button>
          <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); onLogout() }}><Icon name="arrowLeft" size={16} />{t('Log out', 'Keluar')}</button>
        </div>
      )}
    </div>
  )
}
