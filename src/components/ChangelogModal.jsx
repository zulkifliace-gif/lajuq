import React, { useEffect } from 'react';
import { X, Sparkles, Terminal, Calendar } from 'lucide-react';

export default function ChangelogModal({ isOpen, onClose }) {
  // Lock background body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const changelogData = [
    {
      date: '15/08/2026',
      tag: 'Versi Terkini',
      isLatest: true,
      title: 'Kemas Kini Kestabilan Sistem, Token QR Bluetooth, Aliran PREPAY & Vercel Analytics',
      items: [
        {
          heading: '1. Kod QR Bluetooth Mengandungi Token Sah',
          points: [
            'Pelanggan yang mengimbas kertas resit QR daripada printer Bluetooth sebelum ini menerima ralat "Pesanan Gagal: Sambungan tidak stabil" kerana tiada parameter token.',
            'Fungsi cetakan kini secara automatik menyertakan token keselamatan yang sah (&token=...) supaya pesanan terus masuk ke dapur tanpa halangan.'
          ]
        },
        {
          heading: '2. Penjanaan & Carian Token Sesi Serta-Merta (Fallback Supabase REST)',
          points: [
            'Menghapuskan isu race condition semasa pembukaan meja baharu di kaunter.',
            'Token sesi disimpan terus ke dalam state React serta-merta, disokong oleh carian automatik terus ke REST API Supabase jika tiada dalam memori.'
          ]
        },
        {
          heading: '3. Skrin Pelanggan: "Bayaran Selesai" vs "Sesi Ditutup"',
          points: [
            'Skrin merah "Sesi Ditutup" kini hanya aktif sekiranya pesanan dibatalkan secara sengaja oleh kaunter (is_cancelled: true).',
            'Semua sesi yang selesai membuat bayaran akan sentiasa memaparkan skrin hijau "BAYARAN SELESAI / Terima Kasih!" beserta borang maklum balas pelanggan.'
          ]
        },
        {
          heading: '4. Penyelarasan Aliran Mod PREPAY (Bayar Dulu) & POSTPAY (Makan Dulu)',
          points: [
            'Apabila juruwang mengesahkan bayaran di POS (mod PREPAY mahupun POSTPAY), sesi meja terus DITUTUP (CLOSED) dan meja kembali KOSONG untuk pelanggan seterusnya.',
            'Pesanan makanan dilepaskan ke dapur (PENDING) dan kekal dipaparkan di skrin KDS sehingga staf dapur menekan "Siap & Hidang".'
          ]
        },
        {
          heading: '5. KDS Dapur Memaparkan Pesanan yang Telah Dibayar',
          points: [
            'Membetulkan query backend Express agar pesanan aktif di dapur (PAYMENT_PENDING, PENDING, COOKING, READY) kekal dihantar ke KDS walaupun berstatus PAID.'
          ]
        },
        {
          heading: '6. Isu Jumlah Bayaran "RM 0.00" Diperbaiki Sepenuhnya (3 Lapisan Kebal)',
          points: [
            'Melaksanakan sandaran 3 lapisan: Memori Langsung ➡️ Rakaman sessionStorage ➡️ Tarik Terus Database Supabase (REST API).',
            'Jumlah bayaran sebenar (contoh: RM 45.50) dan senarai makanan untuk dinilai kekal dipaparkan dengan tepat walaupun pelanggan me-refresh halaman telefon berkali-kali.'
          ]
        },
        {
          heading: '7. Semakan Discrepancy Bayaran & Aliran POS',
          points: [
            'Mengelakkan penolakan "discrepancy_too_high" apabila pelayar kaunter baru kembali aktif dari background.',
            'Modal bil di POS kekal dibuka sehingga pelayan mengesahkan transaksi berjaya.'
          ]
        },
        {
          heading: '8. Pemasangan Rasmi Vercel Analytics',
          points: [
            'Pemasangan pakej rasmi @vercel/analytics/react untuk menjejak jumlah pelawat harian, paparan halaman, dan klik secara masa nyata di Vercel Dashboard.'
          ]
        },
        {
          heading: '9. Pembersihan UI Panel POS Kaunter',
          points: [
            'Memadam notifikasi toast terapung selepas bayaran disahkan bagi memastikan antaramuka juruwang kekal kemas, bersih, dan pantas.'
          ]
        },
        {
          heading: '10. Segerak Stripe Webhook Secret Live',
          points: [
            'Kemas kini secret webhook Stripe di pelayan VPS bagi memastikan pembaharuan langganan automatik (auto-renewal) menyegerak status penyewa di Supabase tanpa ralat.'
          ]
        }
      ]
    },
    {
      date: '13/08/2026',
      tag: 'Infrastruktur & Langganan',
      isLatest: false,
      title: 'Integrasi Stripe Webhook Live, Multi-Tenant Socket Isolation & Sandaran Database',
      items: [
        {
          heading: '1. Integrasi Webhook Stripe Live & Pakej Langganan',
          points: [
            'Penetapan endpoint webhook rasmi di Express backend (api.lajuq.my/api/stripe/webhook) untuk mengendalikan pengaktifan langganan pelan 4, 8, dan 12 bulan secara automatik.',
            'Penyelarasan kunci rahsia live Stripe dan penyulitan data langganan penyewa.'
          ]
        },
        {
          heading: '2. Pengasingan Soket Multi-Penyewa (Tenant Socket Isolation)',
          points: [
            'Setiap restoran kini mempunyai bilik komunikasi soket (Socket.io room) tersendiri berasaskan tenant_id.',
            'Mengelakkan percampuran data pesanan dan pesanan staf antara restoran yang berbeza.'
          ]
        },
        {
          heading: '3. Penambahbaikan Maklum Balas Pelanggan & Telegram Bot',
          points: [
            'Penstrukturan skema pangkalan data maklum balas pelanggan (customer_feedbacks) bagi menyokong penilaian menu dan komen.'
          ]
        }
      ]
    },
    {
      date: '10/08/2026',
      tag: 'Penguatkuasaan Kuota & POS',
      isLatest: false,
      title: 'Penguatkuasaan Kuota Pelan Percuma, Format Thermal Printer & Grid Meja',
      items: [
        {
          heading: '1. Perlindungan Kuota Pelan Percuma (100 Pesanan Sebulan)',
          points: [
            'Pelaksanaan fungsi penguatkuasaan kuota pesanan di peringkat database trigger dan socket backend.',
            'Popup kiraan undur kitaran 30 hari untuk penyewa yang telah mencapai had kuota percuma.'
          ]
        },
        {
          heading: '2. Format Cetakan Thermal Printer GOOJPRT (58mm & 80mm)',
          points: [
            'Pengoptimuman arahan native ESC/POS untuk cetakan slip QR Code sesi yang padat dan jelas pada pencetak haba Bluetooth.'
          ]
        },
        {
          heading: '3. Paparan Grid Meja Pintar POS',
          points: [
            'Penambahbaikan antaramuka grid meja di POS Kaunter dengan penunjuk warna status masa nyata (Kosong, Ada Pelanggan, Sedang Makan, Pre-Pay Bayaran).'
          ]
        }
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#13171F] border border-white/10 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden text-white relative transform transition-all scale-100">
        
        {/* Header */}
        <div className="bg-[#1A1F2B] px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-[#F04D23] to-[#FF7F27] flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-white">Log Kemas Kini Sistem</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  update.txt
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Sejarah naik taraf & pembaikan ciri LajuQ SaaS</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
            title="Tutup Log Kemas Kini"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body - Scrollable Content with Custom Scrollbar */}
        <div className="p-6 overflow-y-auto space-y-8 text-slate-200 text-xs sm:text-sm custom-scrollbar">
          
          {changelogData.map((log, index) => (
            <div key={index} className="space-y-4 relative">
              
              {/* Date Header Separator Bar */}
              <div className="flex items-center gap-3">
                <div className="h-px bg-gradient-to-r from-transparent via-[#F04D23]/40 to-[#F04D23] flex-1"></div>
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1E2532] border border-white/10 shadow-sm font-mono font-extrabold text-xs">
                  <Calendar className="w-3.5 h-3.5 text-[#FF7F27]" />
                  <span className="text-white">update {log.date}</span>
                  {log.isLatest && (
                    <span className="px-1.5 py-0.2 bg-[#F04D23] text-white text-[9px] font-sans font-black rounded-md tracking-wider uppercase ml-1">
                      TERBARU
                    </span>
                  )}
                </div>
                <div className="h-px bg-gradient-to-r from-[#F04D23] via-[#F04D23]/40 to-transparent flex-1"></div>
              </div>

              {/* Title & Tag */}
              <div className="bg-[#181D27] p-4 rounded-2xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#FFCA3A] shrink-0" />
                    <span>{log.title}</span>
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-mono font-bold">
                    {log.tag}
                  </span>
                </div>

                {/* Updates List */}
                <div className="space-y-4 pt-2">
                  {log.items.map((item, iIdx) => (
                    <div key={iIdx} className="space-y-1.5 bg-[#12151D]/60 p-3 rounded-xl border border-white/5">
                      <p className="font-bold text-slate-100 text-xs sm:text-sm text-[#FF7F27]">
                        {item.heading}
                      </p>
                      <ul className="space-y-1 text-slate-300 text-[11px] sm:text-xs leading-relaxed pl-2">
                        {item.points.map((pt, ptIdx) => (
                          <li key={ptIdx} className="flex items-start gap-2">
                            <span className="text-[#FFCA3A] font-black shrink-0 mt-0.5">•</span>
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          ))}

          {/* Footer Note */}
          <div className="text-center pt-2 pb-2 text-[11px] text-slate-500 font-mono">
            Sistem LajuQ dikemas kini secara berterusan oleh BOTZ Global Solutions.
          </div>

        </div>

        {/* Modal Footer */}
        <div className="bg-[#1A1F2B] px-6 py-3 border-t border-white/10 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400 font-mono">Status Sistem: <strong className="text-emerald-400">100% Aktif</strong></span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
}
