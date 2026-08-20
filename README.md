# The Sultan Laundry — Dashboard Admin

Web dashboard untuk Owner/Admin: kelola order, verifikasi & timbang di outlet, review bukti pembayaran, dan ubah harga master data. Statis, bisa di-hosting di GitHub Pages terpisah dari app pelanggan (atau folder berbeda di repo yang sama).

## Wajib Diisi Sebelum Deploy

Buka `app.js`, baris atas:
```js
const CONFIG = {
  API_BASE_URL: "https://YOUR-BACKEND-URL.example.com",
};
```
Isi dengan URL backend yang sama dipakai app pelanggan.

## Cara Deploy (sama seperti app pelanggan)

1. Buat repo GitHub baru, mis. `sultan-laundry-admin`, atau taruh sebagai sub-folder di repo yang sudah ada.
2. Upload `index.html`, `style.css`, `app.js`.
3. Settings → Pages → aktifkan.
4. **Sarankan tidak diindeks mesin pencari** dan idealnya dibatasi akses (lihat Catatan Keamanan).

## Cara Buat Akun Admin Pertama

Dashboard ini hanya bisa dimasuki role `admin`/`owner`. Karena belum ada endpoint self-register untuk staff, buat manual di database (lihat README backend, bagian "Cara Buat Akun Owner/Admin/Kurir Pertama") — daftar dulu sebagai pelanggan biasa via app pelanggan atau `POST /api/auth/register`, lalu jalankan query:
```sql
UPDATE users SET role = 'admin' WHERE phone = '0812xxxxxxx';
```

## Fitur

- **Ringkasan** — omzet hari ini, jumlah bukti bayar menunggu, order terlambat, sebaran order per tahap
- **Order** — list difilter per status, klik untuk buka detail: input qty/berat riil (Verifikasi & Penimbangan), tombol pindah status sesuai alur, histori lengkap
- **Verifikasi Pembayaran** — lihat foto bukti transfer/QRIS, setujui atau tolak dengan catatan
- **Master Data** — ubah harga item Satuan, harga/kg Kiloan, multiplier durasi, rekening transfer, dan upload gambar QRIS — semua tanpa perlu deploy ulang aplikasi

## Catatan Keamanan (Penting Sebelum Production)

Dashboard ini sengaja **tidak** menyertakan `robots.txt`/`noindex` khusus atau proteksi tambahan di luar login. Untuk skala produksi, sebaiknya:
- Tambahkan `<meta name="robots" content="noindex">` di `index.html` supaya tidak muncul di Google
- Pertimbangkan proteksi tambahan (mis. Cloudflare Access / basic auth di level hosting) karena siapa pun yang tahu URL bisa membuka halaman login
- Backend sudah aman secara API (role dicek di server), jadi risiko utamanya hanya orang asing tahu URL dashboard-nya
