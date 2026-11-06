// Transactional email through Resend (https://resend.com/docs/api-reference/emails/send-email).
// Without RESEND_API_KEY, development prints the message to the console instead; production refuses
// (sent: false), so a missing key never pretends an email went out.

export function createMailer({ apiKey, from, production = false, fetchImpl = globalThis.fetch }) {
  async function send({ to, subject, html, text }) {
    if (!apiKey) {
      if (production) return { sent: false, error: 'RESEND_API_KEY is not configured' }
      console.log(`\n[mail:dev] to ${to} — ${subject}\n${text}\n`)
      return { sent: true, dev: true }
    }
    try {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html, text }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.warn(`[mail] Resend HTTP ${res.status}: ${body.message || body.name || 'error'}`)
        return { sent: false, error: `HTTP ${res.status}` }
      }
      return { sent: true }
    } catch (e) {
      console.warn(`[mail] ${e.message}`)
      return { sent: false, error: e.message }
    }
  }
  return { send }
}

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Every word of the verification email, in the language the user signed up in.
const TEXT = {
  en: {
    subject: code => `Your Tataloka verification code: ${code}`,
    preview: 'Your code to verify your email and unlock your free AI credits.',
    hi: name => `Hi ${name},`,
    intro: 'Enter this code in Tataloka to verify your email and unlock your 30 free AI credits:',
    codeLabel: 'Verification code',
    or: 'Or verify with one tap:',
    button: 'Verify email',
    expiry: minutes => `The code and the button work for ${minutes} minutes.`,
    ignore: 'Didn’t sign up for Tataloka? Ignore this email — the account stays inactive.',
    tagline: 'Redesign your room with AI and real products.',
  },
  id: {
    subject: code => `Kode verifikasi Tataloka: ${code}`,
    preview: 'Kode untuk memverifikasi emailmu dan mengaktifkan kredit AI gratismu.',
    hi: name => `Halo ${name},`,
    intro: 'Masukkan kode ini di Tataloka untuk memverifikasi emailmu dan mengaktifkan 30 kredit AI gratismu:',
    codeLabel: 'Kode verifikasi',
    or: 'Atau verifikasi dengan sekali ketuk:',
    button: 'Verifikasi email',
    expiry: minutes => `Kode dan tombol berlaku ${minutes} menit.`,
    ignore: 'Tidak merasa mendaftar di Tataloka? Abaikan email ini — akun tidak akan aktif.',
    tagline: 'Tata ulang ruanganmu dengan AI dan produk nyata.',
  },
}

// The verification email: the 6-digit code to type in the app, and a one-tap link.
// siteUrl hosts the logo (a PNG — mail apps do not show SVG).
export function verificationEmail({ name, code, link, minutes, locale = 'en', siteUrl = 'https://www.tataloka.com' }) {
  const lang = locale === 'id' ? 'id' : 'en'
  const T = TEXT[lang]
  const site = siteUrl.replace(/\/+$/, '')
  const host = site.replace(/^https?:\/\//, '')
  const subject = T.subject(code)
  const text = `${T.hi(name)}\n\n${T.intro}\n\n${code}\n\n${T.or}\n${link}\n\n${T.expiry(minutes)}\n${T.ignore}\n\n— Tataloka · ${host}`
  const html = `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f3ef;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(T.preview)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f3ef;">
<tr><td align="center" style="padding:28px 16px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;">
    <tr><td style="padding:0 4px 18px 4px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
        <td style="vertical-align:middle;"><img src="${esc(site)}/icons/icon-192.png" width="40" height="40" alt="Tataloka" style="display:block;width:40px;height:40px;border:0;border-radius:10px;"></td>
        <td style="vertical-align:middle;padding-left:12px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:#1d1b18;">Tataloka</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid #e6e1d8;border-radius:16px;padding:30px 28px;font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;color:#1d1b18;">
      <p style="margin:0 0 10px 0;font-size:16px;font-weight:600;">${esc(T.hi(name))}</p>
      <p style="margin:0 0 22px 0;font-size:15px;line-height:1.55;color:#4a4640;">${esc(T.intro)}</p>
      <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#7a746b;">${esc(T.codeLabel)}</p>
      <div style="margin:0 0 26px 0;padding:18px 0;background:#f5f3ef;border-radius:12px;text-align:center;font-size:34px;font-weight:700;letter-spacing:10px;color:#1d1b18;font-family:'SFMono-Regular',Consolas,'Courier New',monospace;">${esc(code)}</div>
      <p style="margin:0 0 12px 0;font-size:14px;color:#4a4640;">${esc(T.or)}</p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:10px;background:#b4532a;">
        <a href="${esc(link)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(T.button)}</a>
      </td></tr></table>
      <p style="margin:26px 0 0 0;padding-top:18px;border-top:1px solid #efebe4;font-size:13px;line-height:1.55;color:#7a746b;">${esc(T.expiry(minutes))}<br>${esc(T.ignore)}</p>
    </td></tr>
    <tr><td align="center" style="padding:18px 8px 0 8px;font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#7a746b;">
      ${esc(T.tagline)}<br><a href="${esc(site)}" style="color:#7a746b;">${esc(host)}</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
  return { subject, html, text }
}
