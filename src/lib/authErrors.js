// Localized messages for auth error codes returned by /api/auth.
const ERRORS = {
  invalid_email: { en: 'Enter a valid email address.', id: 'Masukkan alamat email yang valid.' },
  weak_password: { en: 'Password must be at least 8 characters.', id: 'Kata sandi minimal 8 karakter.' },
  email_taken: { en: 'This email is already registered — log in instead.', id: 'Email ini sudah terdaftar — silakan masuk.' },
  invalid_credentials: { en: 'Wrong email or password. If you signed up with Google, use the Google button.', id: 'Email atau kata sandi salah. Jika mendaftar dengan Google, gunakan tombol Google.' },
  too_many_attempts: { en: 'Too many attempts — please wait a few minutes.', id: 'Terlalu banyak percobaan — tunggu beberapa menit.' },
  google_cancelled: { en: 'Google sign-in was cancelled.', id: 'Masuk dengan Google dibatalkan.' },
  google_state: { en: 'Google sign-in expired — please try again.', id: 'Sesi masuk Google kedaluwarsa — coba lagi.' },
  google_unverified: { en: 'Your Google email is not verified.', id: 'Email Google kamu belum terverifikasi.' },
  google_failed: { en: 'Google sign-in failed — please try again.', id: 'Masuk dengan Google gagal — coba lagi.' },
  google_disabled: { en: 'Google sign-in is not set up on this server.', id: 'Masuk dengan Google belum diaktifkan di server ini.' },
  // email verification
  invalid_code: { en: 'That code is not right — check the latest email.', id: 'Kode salah — cek email terbaru.' },
  code_expired: { en: 'This code has expired — send a new one.', id: 'Kode sudah kedaluwarsa — kirim kode baru.' },
  code_locked: { en: 'Too many wrong codes — send a new one.', id: 'Terlalu banyak kode salah — kirim kode baru.' },
  resend_too_soon: { en: 'Please wait a moment before sending another code.', id: 'Tunggu sebentar sebelum mengirim kode lagi.' },
  email_failed: { en: 'The email could not be sent — try again in a minute.', id: 'Email gagal dikirim — coba lagi sebentar lagi.' },
  verify_expired: { en: 'That verification link has expired — send a new code.', id: 'Link verifikasi sudah kedaluwarsa — kirim kode baru.' },
  verify_invalid: { en: 'That verification link is no longer valid.', id: 'Link verifikasi itu sudah tidak berlaku.' },
}
export const authErrorText = (code, locale) => (ERRORS[code]?.[locale] || ERRORS[code]?.en || null)
