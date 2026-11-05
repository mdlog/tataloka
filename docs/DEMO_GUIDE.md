# Panduan Demo — Tataloka

Versi live: **https://www.tataloka.com** (aplikasi di **/app**). Untuk demo offline/lokal, ikuti langkah di bawah.

## Sebelum rekam / presentasi

1. `.env` berisi `META_API_KEY` → `npm run check:api` (keempat model harus ✓). Opsional: `npm run check:live` untuk mencoba semua endpoint sekali (± beberapa sen).
2. `npm run build && npm start`, buka **http://localhost:5173** (landing page). Aplikasinya ada di **/app** — tombol **Desain ruanganku** di landing page langsung ke sana.
3. Pastikan status kanan atas **● Meta AI** (hijau). Kalau tertulis **Mode demo**, server belum membaca key — restart server.
4. Siapkan foto ruanganmu sendiri (lurus dari depan, terang, tanpa orang) selain foto contoh.

## Alur demo (±2 menit)

1. **Setup** — pilih Ruang Tamu, gaya Japandi (lihat moodboard foto produk asli), budget Rp 25 juta, klik **Pakai foto contoh** → **Desain ruanganku**.
2. **Proses** — SAM 3.1 menggambar kotak di foto (±6 detik), lalu Muse Spark menyusun desain (±18 detik).
3. **Hasil** — tunjukkan:
   - Judul & catatan desain yang menyebut isi fotomu (mis. kursi kuning lama diganti).
   - **Daftar produk**: semua produk IKEA Indonesia asli dengan foto, harga, dan link; total vs budget.
   - Tab **3D**: putar, seret sofa; tab **Denah**: ukuran ruang & furnitur sesuai ukuran produk asli.
   - **Ganti produk** (ikon ⇄) → pilih alternatif → total berubah.
   - Tab **Render AI** → **Buat render** → slider sebelum/sesudah (±20 detik).
4. **Ukuran nyata** — klik badge ukuran (mis. “4.0 × 5.0 m · perkiraan AI”), isi ukuran hasil meteran → furnitur ikut menyesuaikan dan badge menjadi “diukur”. Opsional di awal: rekam **video** ruangan 10–20 detik (HP: tombol **Video**) atau isi **Ukuran ruangan → Saya ukur sendiri**.
5. **Ganti gaya** (chip Skandinavia) — hanya Muse Spark yang dipanggil ulang.
6. **Asisten** — ketik/ucapkan “add a floor lamp” → lampu nyata ditambahkan.
7. **Katalog → Tokopedia · Shopee** — cari listing marketplace via pencarian web Meta (tautan terverifikasi).
8. **Cetak / PDF** (termasuk render AI) atau **CSV** daftar belanja.
9. **Di HP** — tunjukkan tab bar bawah, bottom sheet, dan **Pasang aplikasi** (tab Akun).

## Skrip narasi

**[0:00] Masalah** — “Mau merapikan ruangan, tapi bingung mulai dari mana dan berapa biaya sebenarnya.”

**[0:15] Foto → analisis** — “Saya upload foto ruang tamu. SAM 3.1 dari Meta mengenali lantai, dinding, dan furnitur yang ada.”

**[0:35] Desain dengan produk nyata** — “Muse Spark melihat foto itu dan menyusun desain Japandi — bukan dari barang khayalan, tapi dari katalog produk IKEA Indonesia lengkap dengan harga asli. Totalnya Rp 10 juta, di bawah budget saya.”

**[1:00] Edit** — “Saya bisa memindah furnitur di 3D atau di denah, dan mengganti sofa dengan alternatif lain — budget langsung terhitung ulang.”

**[1:20] Render & suara** — “Muse Image memperlihatkan ruangan saya dengan gaya baru. Dan saya bisa bilang ‘tambah lampu lantai’ — Muse Voice dan Muse Spark langsung menambahkannya.”

**[1:45] Penutup** — “Tataloka: dari satu foto ke desain interior yang benar-benar bisa dibeli — dibangun dengan SAM 3.1, Muse Spark, Muse Image, Muse Voice, dan pencarian web Meta.”

## Tips

- Klik **Buat render** lebih awal, lalu lanjut bicara sambil menunggu.
- Jika koneksi/API bermasalah, aplikasi tetap jalan (desain demo dari katalog nyata) dan menampilkan pesan error-nya.
- Harga di katalog adalah harga toko per tanggal yang tertera; perbarui dengan `npm run catalog:build` sebelum submit.
