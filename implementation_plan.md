# Laporan Audit & Pelan Tindakan: Aliran Pesanan Pelanggan (Pay First vs Eat First)

Berdasarkan semakan mendalam ke atas keseluruhan kitaran pesanan dari peranti pelanggan ke skrin dapur (KDS), terdapat beberapa isu kritikal yang menghalang aliran "Bayar Dulu" (Pre-Pay) berfungsi dengan betul, serta isu token yang perlu dioptimumkan.

## 1. Penemuan Audit

### A. Mod "Bayar Dulu" (PREPAY) Tersekat!
*   **Isu 1:** Apabila pelanggan menekan butang hantar pesanan, backend (`server.js` acara `SUBMIT_ORDER`) sentiasa merekodkan pesanan sebagai `PENDING` (terus masuk dapur). Sistem tidak menyemak sama ada restoran menggunakan mod `PREPAY`! Akibatnya, pesanan dihantar terus ke dapur walaupun pelanggan belum membayar di kaunter.
*   **Isu 2:** Walaupun kita perbaiki Isu 1 (jadikan ia `PAYMENT_PENDING`), fungsi kaunter "Sahkan Bayaran" (`COMPLETE_PAYMENT`) ketika ini hanya menukar `payment_status` kepada `PAID`, tetapi terlupa menukar `kitchen_status` kepada `PENDING`. Ini akan menyebabkan pesanan hilang di alam siber (dapur tak nampak, kaunter dah bayar).

### B. Keserasian Token
*   Token pengesahan (`access_token`) telah digunakan di dalam QR Code dan proses sambungan awal. Walau bagaimanapun, semasa pelanggan menekan butang "Tukar Template" (contoh: Classic vs Modern), kita perlu pastikan sistem tidak kehilangan token. Semakan mendapati UI berjalan lancar. 
*   Kita akan membina ujian dalam fungsi untuk memastikan sesi tertutup secara harmoni antara mod bayar.

## 2. Pelan Pelaksanaan (Implementation Plan)

### A. Pembaikan Aliran Pesanan & Dapur (`server.js`)
1.  **Dalam `SUBMIT_ORDER`:**
    *   Ambil tetapan `operationalMode` kedai.
    *   Jika kedai adalah mod `PREPAY` (Bayar Dulu), pesanan baru disetkan `kitchen_status: 'PAYMENT_PENDING'`. 
    *   Jika `POSTPAY` (Makan Dulu), terus masuk dapur (`PENDING`).
2.  **Dalam `COMPLETE_PAYMENT`:**
    *   Apabila juruwang menekan "💳 Sahkan Bayaran", backend akan menyemak jika ada pesanan berstatus `PAYMENT_PENDING`.
    *   Semua pesanan `PAYMENT_PENDING` tersebut akan ditukar kepada `PENDING` supaya ia serta-merta melantun (pop-up) di skrin tablet dapur (KDS).

### B. Pengurusan Status Sesi (Meja)
*   Untuk membolehkan pesanan siap dihantar ke meja, sesi tidak akan dibatalkan/void jika ada pesanan yang masih dimasak di dapur, melainkan pelanggan telah memakan semuanya (POSTPAY) atau pesanan Pre-pay masih dalam proses. Sistem sedia ada akan dikemaskini secara automatik (sync) ke semua peranti.

## User Review Required

Sila semak pelan pembaikan Mod Pesanan ini. Jika anda bersetuju saya menaip kod untuk membaiki kelompongan Pre-Pay (Bayar Dulu) supaya dapur menerima pesanan dengan betul selepas bayaran dibuat, tekan butang **Proceed / Luluskan**.
