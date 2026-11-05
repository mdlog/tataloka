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
}
export const authErrorText = (code, locale) => (ERRORS[code]?.[locale] || ERRORS[code]?.en || null)
