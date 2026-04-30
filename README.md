# Praktikum 7 - WebSocket: Kuis Rebutan Real-time

Game kuis rebutan berbasis WebSocket menggunakan **Hono** dan **Node.js**.
Pemain bersaing menekan tombol **BUZZ** untuk mendapat giliran menjawab soal pengetahuan umum.

> **Versi:** 1.0.0
> **Tech Stack:** Hono, Node.js, WebSocket, @hono/node-ws

---

## Struktur Project

```text
praktikum7-v2/
+-- src/
|   +-- index.js       <- Server utama (Hono + WebSocket)
+-- public/
|   +-- index.html     <- Client UI (browser)
+-- package.json
+-- package-lock.json
+-- README.md
```

---

## Cara Setup dan Menjalankan

### 1. Install dependencies

```bash
npm install
```

### 2. Jalankan server

```bash
# Mode biasa
npm start

# Mode watch / auto-restart
npm run dev
```

### 3. Buka aplikasi

```text
http://localhost:3000/client
```

Buka minimal 2 tab atau jendela browser: satu sebagai **Host**, satu atau lebih sebagai **Player**.

---

## Cara Bermain

### Sebagai Host

1. Pilih peran **HOST**, masukkan username, lalu klik **MASUK**.
2. Klik **BUKA SOAL BARU** untuk menampilkan pertanyaan ke semua player.
3. Host langsung melihat **jawaban benar** sejak soal dibuka.
4. Ketika ada player menekan **BUZZ**, player tersebut mendapat waktu 15 detik untuk mengirim jawaban.
5. Setelah player menjawab, Host melihat jawaban player dan membandingkannya dengan jawaban benar.
6. Klik **BENAR** jika jawaban diterima, atau **SALAH** jika jawaban tidak diterima.
7. Klik **SOAL BERIKUTNYA** untuk kembali ke mode tunggu.
8. Klik **RESET SEMUA SKOR** untuk memulai ulang skor dan ronde.

### Sebagai Player

1. Pilih peran **PLAYER**, masukkan username, lalu klik **MASUK**.
2. Tunggu Host membuka soal.
3. Baca pertanyaan dan klik **BUZZ** secepat mungkin.
4. Jika buzz diterima, ketik jawaban dalam waktu 15 detik.
5. Jika Host menilai jawaban benar, player mendapat **+10 poin**.

---

## Alur Game

1. Host membuka soal baru.
2. Server memilih soal acak dari bank soal.
3. Player menerima pertanyaan tanpa jawaban.
4. Host menerima pertanyaan beserta jawaban benar.
5. Player tercepat menekan **BUZZ** mendapat giliran menjawab.
6. Timer 15 detik berjalan.
7. Jawaban player dikirim ke Host untuk divalidasi.
8. Host memberi keputusan benar atau salah.
9. Server memperbarui scoreboard dan membroadcast hasil ke semua client.

---

## WebSocket Message Types

### Client ke Server

| Event | Keterangan |
|---|---|
| `JOIN_HOST` | Daftar sebagai host |
| `JOIN_PLAYER` | Daftar sebagai player |
| `START_SESSION` | Host membuka soal baru |
| `BUZZ` | Player menekan tombol buzz |
| `SEND_ANSWER` | Player mengirim jawaban |
| `JUDGE` | Host memvalidasi jawaban player (`benar` / `salah`) |
| `NEXT_ROUND` | Host mengembalikan game ke mode tunggu |
| `RESET_SCORES` | Host mereset skor dan ronde |

### Server ke Client

| Event | Keterangan |
|---|---|
| `HOST_CONFIRMED` | Konfirmasi berhasil masuk sebagai host |
| `PLAYER_CONFIRMED` | Konfirmasi berhasil masuk sebagai player |
| `INFO` | Pesan info umum |
| `ERROR` | Pesan error |
| `SESSION_STARTED` | Soal baru dimulai. Untuk Host, payload juga berisi `correctAnswer` |
| `BUZZ_ACCEPTED` | Buzz berhasil, berisi nama pemenang buzz dan batas waktu |
| `ANSWER_TICK` | Countdown timer jawaban |
| `PENDING_ANSWER` | Jawaban player menunggu validasi Host |
| `CHAT_MESSAGE` | Pesan chat/status jawaban untuk player |
| `ANSWER_TIMEOUT` | Waktu menjawab habis |
| `ANSWER_RESULT` | Hasil validasi jawaban dan update scoreboard |
| `WAITING` | Game menunggu soal berikutnya |
| `SCORES_RESET` | Skor dan ronde telah direset |

---

## Fitur yang Diimplementasikan

1. Pemisahan role **Host** dan **Player**.
2. Broadcasting real-time menggunakan WebSocket.
3. Sistem BUZZ untuk menentukan player yang berhak menjawab.
4. Timer 15 detik setelah buzz diterima.
5. Host dapat melihat jawaban benar sejak soal dibuka.
6. Player tidak dapat melihat jawaban benar sebelum hasil diumumkan.
7. Validasi jawaban dilakukan manual oleh Host.
8. Sistem poin: jawaban benar mendapat **+10 poin**.
9. Scoreboard real-time yang diurutkan berdasarkan skor.
10. Bank soal pengetahuan umum yang dipilih secara acak.
11. Reset skor dan ronde.

---

## Catatan Testing

Contoh prompt untuk eksplorasi unit test dengan AI:

```text
Buatkan unit test untuk WebSocket server Node.js yang menangani event
JOIN_HOST, JOIN_PLAYER, START_SESSION, BUZZ, SEND_ANSWER, dan JUDGE
menggunakan Jest atau Vitest.
```

Skenario yang perlu diuji:

1. Hanya satu Host yang boleh aktif.
2. Player dapat bergabung dan muncul di scoreboard.
3. Saat `START_SESSION`, Host menerima `correctAnswer`, sedangkan Player tidak.
4. Hanya Player yang dapat melakukan `BUZZ`.
5. Hanya pemenang buzz yang dapat mengirim jawaban.
6. Host dapat memberi verdict `benar` atau `salah`.
7. Skor bertambah 10 ketika jawaban dinilai benar.
8. Timer menghasilkan `ANSWER_TIMEOUT` jika player tidak menjawab.
