import React from 'react'
import Icon from './Icon.jsx'
import { Avatar } from './UserMenu.jsx'

// Bottom tab bar on phones, like a native app (hidden on wider screens via CSS).
export default function MobileNav({ locale = 'en', active, user, credits, onDesign, onSaved, onCredits, onAccount }) {
  const t = (en, id) => (locale === 'id' ? id : en)
  const tabs = [
    { id: 'design', icon: 'sparkles', label: t('Design', 'Desain'), onClick: onDesign },
    { id: 'saved', icon: 'layers', label: t('Saved', 'Tersimpan'), onClick: onSaved },
    // the balance itself is in the top bar; the tab only flags a low balance
    ...(credits ? [{ id: 'credits', icon: 'wallet', label: t('Credits', 'Kredit'), onClick: onCredits, badge: credits.remaining < 3 ? credits.remaining : undefined, low: true }] : []),
    { id: 'account', icon: 'user', label: user ? t('Account', 'Akun') : t('Log in', 'Masuk'), onClick: onAccount },
  ]
  return (
    <nav className="tabbar" aria-label={t('App navigation', 'Navigasi aplikasi')}>
      {tabs.map(tab => (
        <button key={tab.id} className={`tabbar-item ${active === tab.id ? 'active' : ''}`} aria-current={active === tab.id ? 'page' : undefined} onClick={tab.onClick}>
          <span className="tabbar-icon">
            {tab.id === 'account' && user ? <Avatar user={user} size={24} /> : <Icon name={tab.icon} size={22} />}
            {tab.badge !== undefined && <span className={`tabbar-badge ${tab.low ? 'low' : ''}`}>{tab.badge}</span>}
          </span>
          <span className="tabbar-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
