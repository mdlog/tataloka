# Model langganan Tataloka

**Ringkasan:** gratis sekarang, dengan kredit AI bulanan yang terlihat jelas di aplikasi. Paket berbayar (Plus, Pro, isi ulang) sudah dirancang dan tampil di landing page sebagai "Segera hadir". Paket-paket itu baru bisa dijual setelah payment gateway (Midtrans/Xendit) terpasang.

## Kenapa kredit, bukan langganan "unlimited"

Biaya Tataloka hampir seluruhnya biaya panggilan Meta Model API, dan biaya itu naik per aksi.

Pengukuran 4 Nov 2026 memakai token usage asli dari API (foto contoh 1024×904, `reasoning_effort=low`). Tarif yang dipakai: Muse Spark US$1,25/1 jt token input, US$0,15/1 jt token input ter-cache, US$4,25/1 jt token output (termasuk token reasoning); SAM 3.1 US$2,50/1.000 gambar per konsep; web search US$2,50/1.000 pencarian; Muse Image US$0,01/gambar.

| Aksi | Pemakaian terukur | Biaya API |
|---|---|---|
| Desain dari foto | SAM 10 konsep (US$0,025) + Spark 3.923 token in / 2.179 out (US$0,0142) | **US$0,039** |
| Ganti gaya (dengan foto) | Spark ±3.900 in / ±2.200 out | US$0,014 |
| Desain tanpa foto / ganti gaya tanpa foto | Spark 2.549 in / 2.032 out | US$0,009 (prompt ter-cache) – US$0,012 |
| Render foto AI | Muse Image, 1 gambar | US$0,010 |
| Cari di Tokopedia & Shopee | Spark 2.705 in / 213 out + 2 web search | US$0,009 |
| Perintah asisten (gratis bagi pengguna) | Spark 390 in / 595 out | US$0,003 |
| Transkripsi suara | Muse Voice Transcribe | belum dihitung |

Paket unlimited akan merugi jika dipakai pengguna berat, sedangkan kuota per fitur membingungkan. Kredit menyatukan semuanya menjadi satu angka yang mudah dipahami. Pola ini umum dipakai aplikasi AI generatif.

## Harga kredit per aksi

**1 kredit ≈ maksimal US$0,0142 (± Rp235 pada kurs Rp16.500/US$) biaya API.** Kasus termahal per kredit adalah ganti gaya ketika ada foto. Desain dari foto US$0,013 per kredit, render US$0,010, pencarian marketplace US$0,009.

**30 kredit gratis = maksimal ±US$0,43 (±Rp7.000) per pengguna per bulan**, dihitung jika seluruh kredit dipakai untuk aksi termahal. Contoh: 10 desain dari foto = US$0,39. Campuran 5 desain dari foto + 10 ganti gaya + 5 render = US$0,39.

Perintah asisten (±US$0,003 per perintah) dan transkripsi suara tidak memotong kredit, tetapi hanya bisa dipakai selama akun masih punya kredit (saldo 0 = asisten berhenti sampai kredit terisi lagi). Pemakaiannya juga dibatasi rate limit 60 permintaan AI per 10 menit per akun. Jika perlu, beri batas harian untuk asisten (misalnya 100 perintah/hari ≈ US$0,30) agar tidak disalahgunakan.

| Aksi | Kredit |
|---|---|
| Desain dari foto | 3 (analisis foto 2 + desain 1) |
| Desain dari video atau beberapa foto (hingga 7 sudut) | 5 (analisis foto utama 2 + desain 1 + sudut tambahan 2) — perkiraan biaya API ±US$0,05: SAM pada 1 frame utama + Muse Spark membaca semua sudut (sudut tambahan dikirim 768 px) |
| Desain tanpa foto / ganti gaya | 1 |
| Render foto AI | 1 |
| Cari di Tokopedia & Shopee | 1 (pencarian yang sama dalam 24 jam gratis) |
| Asisten desain (teks & suara) | Gratis selama masih ada kredit |
| Edit, simpan, ekspor | Gratis |

Aturan yang menjaga kepercayaan pengguna:

- Panggilan AI yang gagal → kredit otomatis dikembalikan.
- Kredit bulanan terisi lagi tiap tanggal 1 pukul 00:00 WIB. Kredit bonus/isi ulang tidak ikut direset.
- Biaya selalu tampil di tombolnya ("Desain ruanganku · 3 kredit"). Kalau saldo tidak cukup, aksi tidak dimulai dan pengguna melihat kapan kreditnya terisi lagi.

## Paket

| | **Gratis** (aktif) | **Plus** (segera) | **Pro** (segera) |
|---|---|---|---|
| Harga | Rp0 | Rp49.000/bln · Rp490.000/thn | Rp129.000/bln · Rp1.290.000/thn |
| Kredit/bulan | 30 (≈10 desain dari foto) | 150 (≈50) | 400 (≈130) |
| Untuk siapa | Mencoba untuk ruangan sendiri | Renovasi / pindah rumah | Desainer interior, agen properti |
| Tambahan | — | Sisa kredit terbawa 1 bulan, bisa beli kredit tambahan | Penggunaan komersial, papan desain dengan logo sendiri |

**Isi ulang:** 50 kredit seharga Rp25.000, berlaku 12 bulan (segera hadir).

### Hitungan margin (kasus terburuk: semua kredit habis dipakai)

| Paket | Pendapatan | Biaya API maks. | Margin terburuk |
|---|---|---|---|
| Gratis | Rp0 | ±Rp7.000 / pengguna / bulan | biaya akuisisi |
| Plus | Rp49.000 | ±Rp35.250 | ±28% (sebelum biaya payment ±3%) |
| Pro | Rp129.000 | ±Rp94.000 | ±27% |
| Isi ulang | Rp25.000 | ±Rp11.750 | ±53% |

Pemakaian nyata biasanya jauh di bawah kuota, jadi margin riilnya lebih tinggi. Tes otomatis (`tests/credits.test.js`) memastikan harga paket berbayar selalu lebih besar daripada biaya kredit maksimalnya.

## Cara kerja di aplikasi

- **Sumber angka:** `src/data/plans.js`. Server, aplikasi, dan landing page membaca dari file yang sama, jadi harga atau kuota cukup diubah di satu tempat.
- **Server** (`server/credits.js`): kredit dipotong sebelum memanggil Meta API, lalu dikembalikan kalau panggilan gagal. Kalau saldo tidak cukup, server membalas `402 no_credits`. Sisa saldo dikirim di header `X-Tataloka-Credits`. Riwayat pemakaian tersimpan di tabel `credit_events`.
- **Aplikasi:** chip saldo di top bar dan menu akun, panel "Kredit kamu" (saldo, tanggal isi ulang, biaya per aksi, aktivitas terakhir), serta biaya di setiap tombol AI.
- **Landing page:** bagian Harga (`/#pricing`) dengan pilihan bulanan/tahunan dan tabel biaya kredit.
- **Admin:**

```bash
npm run credits                                   # semua akun + saldo
npm run credits -- email@contoh.com               # detail + riwayat
npm run credits -- email@contoh.com --add 50      # beri 50 kredit bonus (mis. untuk juri)
npm run credits -- email@contoh.com --plan pro    # ubah paket secara manual
```

- `CREDITS=off` di `.env` mematikan sistem kredit (rate limit tetap berlaku).

## Langkah berikutnya untuk mulai berjualan

1. Daftar merchant Midtrans atau Xendit (QRIS, e-wallet, VA bank, kartu).
2. Buat endpoint checkout dan webhook pembayaran. Webhook yang sudah terverifikasi memanggil `credits.setPlan()` / `credits.grant()`.
3. Tambahkan kolom masa aktif paket (`plan_until`) dan turunkan otomatis ke Gratis saat masa aktifnya habis.
4. Ubah `available: true` di `src/data/plans.js` agar tombol "Segera hadir" menjadi tombol beli.
5. Perbarui halaman Ketentuan (pengembalian dana, perpanjangan otomatis) sebelum pembayaran pertama.
