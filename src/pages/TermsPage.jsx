import React from 'react';
import { ArrowLeft, ShieldCheck, FileText, Lock, AlertTriangle, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-[#F04D23] selection:text-white">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-3.5 py-2 rounded-xl border border-slate-700 transition active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Laman Utama</span>
          </button>
          <div className="flex items-center gap-2 text-xs font-black text-rose-500 font-mono tracking-wider uppercase">
            <ShieldCheck className="w-4 h-4 text-[#F04D23]" />
            <span>Dokumen Undang-Undang</span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        
        {/* Title Card */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 border border-slate-800 rounded-3xl p-6 sm:p-10 mb-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#F04D23]/10 rounded-full filter blur-3xl pointer-events-none" />
          <div className="inline-flex items-center gap-2 bg-[#F04D23]/10 text-[#F04D23] border border-[#F04D23]/30 px-3 py-1 rounded-full text-xs font-extrabold mb-4 font-mono">
            <Scale className="w-3.5 h-3.5" />
            Terma & Syarat Rasmi
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-3">
            Terms of Service & Penafian Perkhidmatan
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-2xl">
            Sila baca terma perkhidmatan ini dengan teliti sebelum mendaftar atau menggunakan platform perisian <strong className="text-slate-200">RefillPass / System Order</strong>.
          </p>
          <p className="text-slate-500 text-[11px] font-mono mt-4">
            Kemaskini Terakhir: 10 Ogos 2026
          </p>
        </div>

        {/* Content Sections */}
        <div className="space-y-6 text-xs sm:text-sm leading-relaxed text-slate-300">
          
          {/* Section 1 */}
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-[#F04D23]/10 text-[#F04D23] rounded-xl">
                <FileText className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white">1. Pengenalan & Sifat Perkhidmatan (SaaS)</h2>
            </div>
            <p className="text-slate-400 mb-3">
              Platform ini dikendalikan sebagai penyedia perisian berasaskan Awan (Software-as-a-Service / SaaS). Dengan mendaftar, mengunggah menu, atau menggunakan sistem ini, anda (Pemilik Restoran / Peniaga) bersetuju bahawa platform ini disediakan secara <strong className="text-slate-200">"AS IS" (Sebagaimana Adanya)</strong> dan <strong className="text-slate-200">"AS AVAILABLE"</strong>.
            </p>
            <p className="text-slate-400">
              Pihak kami hanya menyediakan platform perisian pengurusan pesanan dan tidak terlibat secara langsung dalam operasi harian, pembuatan makanan, atau transaksi kewangan fizikal restoran anda.
            </p>
          </section>

          {/* Section 2 */}
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white">2. Penafian Liabiliti & Ganti Rugi Operasi</h2>
            </div>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li>
                <strong className="text-slate-200">Kerugian Perniagaan:</strong> Pihak penyedia perisian tidak bertanggungjawab ke atas sebarang kerugian pendapatan, kehilangan pesanan, atau gangguan perniagaan sekiranya berlaku kegagalan rangkaian internet, gangguan bekalan elektrik, atau penutupan pelayan (*server downtime*).
              </li>
              <li>
                <strong className="text-slate-200">Integrasi Perkakas (Hardware):</strong> Kegagalan peranti pencetak (Thermal Printer), tablet KDS, atau paparan browser di pihak restoran adalah di bawah tanggungjawab penyelenggaraan restoran sendiri.
              </li>
              <li>
                <strong className="text-slate-200">Kualiti & Alahan Makanan:</strong> Pihak penyedia perisian tidak bertanggungjawab terhadap isu kualiti makanan, kesilapan ramuan, alahan (*allergic reactions*), atau pertikaian harga antara restoran dan pelanggan akhir.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white">3. Tanggungjawab Akaun & Keselamatan Data</h2>
            </div>
            <p className="text-slate-400 mb-3">
              Pemilik restoran bertanggungjawab sepenuhnya ke atas kerahsiaan akaun, emel, kata laluan, dan Nombor PIN Staf yang digunakan untuk mengakses sistem. Sebarang transaksi atau tetapan yang dibuat melalui akaun anda dianggap sebagai arahan sah dari restoran anda.
            </p>
            <p className="text-slate-400">
              Pihak perisian berhak melarang, menggantung, atau memadam akaun yang didapati menyalahi undang-undang Malaysia, melakukan cubaan pencerobohan data, atau menggunakan sistem untuk tujuan penipuan.
            </p>
          </section>

          {/* Section 4 */}
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white">4. Polisi Privasi & Akta PDPA 2010</h2>
            </div>
            <p className="text-slate-400 mb-2">
              Data yang dikumpul melalui platform ini (termasuk emel, nama restoran, sejarah pesanan, dan maklumat asas) digunakan semata-mata untuk mengendalikan perkhidmatan perisian, analitik perniagaan, dan notifikasi pesanan Telegram.
            </p>
            <p className="text-slate-400">
              Pihak penyedia perisian komited untuk melindungi data anda dan tidak akan menjual atau berkongsi maklumat peribadi kepada pihak ketiga yang tidak berkaitan tanpa kebenaran bertulis, tertakluk kepada undang-undang Akta Perlindungan Data Peribadi 2010 (PDPA) Malaysia.
            </p>
          </section>

          {/* Section 5 */}
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-white mb-2">5. Pindaan Terma</h2>
            <p className="text-slate-400">
              Pihak penyedia perisian berhak mengemas kini terma ini pada bila-bila masa mengikut keperluan undang-undang dan perkemabangan sistem. Penggunaan berterusan perkhidmatan selepas kemaskini dianggap sebagai persetujuan anda terhadap terma terkini.
            </p>
          </section>

        </div>

        {/* Footer info */}
        <div className="mt-12 text-center text-xs text-slate-500 border-t border-slate-800 pt-6">
          <p>© 2026 RefillPass System Order. Hak Cipta Terpelihara.</p>
        </div>
      </main>
    </div>
  );
}
