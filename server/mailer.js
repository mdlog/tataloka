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

// The verification email: the 6-digit code to type in the app, and a one-tap link.
export function verificationEmail({ name, code, link, minutes, locale = 'en' }) {
  const id = locale === 'id'
  const hi = id ? `Halo ${name},` : `Hi ${name},`
  const intro = id ? 'Masukkan kode ini di Tataloka untuk memverifikasi emailmu dan mengaktifkan kredit AI gratismu:' : 'Enter this code in Tataloka to verify your email and unlock your free AI credits:'
  const or = id ? 'Atau ketuk tombol ini:' : 'Or tap this button:'
  const button = id ? 'Verifikasi email' : 'Verify email'
  const expiry = id ? `Kode dan tombol berlaku ${minutes} menit.` : `The code and the button work for ${minutes} minutes.`
  const ignore = id ? 'Tidak merasa mendaftar di Tataloka? Abaikan email ini — akun tidak akan aktif.' : 'Didn’t sign up for Tataloka? Ignore this email — the account stays inactive.'
  const subject = id ? `Kode verifikasi Tataloka: ${code}` : `Your Tataloka verification code: ${code}`
  const text = `${hi}\n\n${intro}\n\n${code}\n\n${or}\n${link}\n\n${expiry}\n${ignore}\n\n— Tataloka · www.tataloka.com`
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f3ef;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1b18">
<div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #e6e1d8;border-radius:16px;padding:28px">
<div style="font-family:Georgia,serif;font-size:22px;font-weight:600">Tataloka</div>
<p style="margin:20px 0 8px;font-size:15px">${esc(hi)}</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#4a4640">${esc(intro)}</p>
<div style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;background:#f5f3ef;border-radius:12px;padding:16px 0">${esc(code)}</div>
<p style="margin:22px 0 10px;font-size:14px;color:#4a4640">${esc(or)}</p>
<a href="${esc(link)}" style="display:inline-block;background:#1d1b18;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${esc(button)}</a>
<p style="margin:22px 0 0;font-size:13px;color:#7a746b;line-height:1.5">${esc(expiry)}<br>${esc(ignore)}</p>
</div>
<p style="text-align:center;font-size:12px;color:#7a746b;margin-top:16px">Tataloka · <a href="https://www.tataloka.com" style="color:#7a746b">www.tataloka.com</a></p>
</body></html>`
  return { subject, html, text }
}
