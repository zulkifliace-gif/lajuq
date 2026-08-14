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
      title: 'Peningkatan Kestabilan Sambungan QR, Pengesahan Bayaran Pantas & Prestasi Sistem',
      items: [
        {
          heading: '1. Peningkatan Sambungan Kod QR Slip Resit',
          points: [
            'Mempertingkatkan sambungan bagi pelanggan yang mengimbas kod QR fizikal dari resit cetakan.',
            'Pesanan pelanggan kini dihantar secara terus ke dapur dengan lebih pantas dan stabil tanpa gangguan sambungan.'
          ]
        },
        {
          heading: '2. Pengoptimuman Pembukaan Meja Baharu',
          points: [
            'Proses membuka meja dan menjana pautan menu di kaunter kini berlaku serta-merta dengan sandaran keselamatan automatik.'
          ]
        },
        {
          heading: '3. Paparan Status Bayaran & Maklum Balas Pelanggan',
          points: [
            'Pelanggan yang telah selesai membuat bayaran akan sentiasa menerima paparan resit digital yang jelas beserta borang penilaian kepuasan pelanggan.'
          ]
        },
        {
          heading: '4. Penyelarasan Aliran Mod Bayar Dulu (Pre-Pay) & Makan Dulu (Post-Pay)',
          points: [
            'Sistem meja di kaunter kini dikosongkan secara automatik sebaik sahaja bayaran disahkan bagi melancarkan giliran pelanggan seterusnya.',
            'Pesanan makanan kekal dipaparkan di skrin dapur (KDS) sehingga tukang masak selesai menyediakan hidangan.'
          ]
        },
        {
          heading: '5. Ketepatan Kiraan Jumlah Bayaran Pelanggan',
          points: [
            'Menambah baik ketepatan paparan jumlah bil pada telefon pelanggan supaya sentiasa tepat walaupun halaman dimuat semula (refresh).'
          ]
        },
        {
          heading: '6. Pengoptimuman Kelancaran Panel Kaunter POS',
          points: [
            'Mempercepat proses pengesahan bayaran di kaunter dan menghapuskan notifikasi berulang untuk pengalaman juruwang yang lebih lancar.'
          ]
        },
        {
          heading: '7. Integrasi Analitik Trafik Laman Web',
          points: [
            'Menambah pemantauan analitik trafik rasmi bagi memantau prestasi sistem dan bilangan pelawat harian secara langsung.'
          ]
        },
        {
          heading: '8. Pemantapan Sistem Automasi Langganan',
          points: [
            'Memperkukuh komunikasi selamat antara gerbang pembayaran dengan pelayan sistem bagi pembaharuan langganan yang lebih lancar.'
          ]
        }
      ]
    },
    {
      date: '13/08/2026',
      tag: 'Infrastruktur & Keselamatan',
      isLatest: false,
      title: 'Peningkatan Keselamatan Data Multi-Restoran & Automasi Langganan',
      items: [
        {
          heading: '1. Pengasingan Data Restoran yang Lebih Ketat',
          points: [
            'Memperkukuh keselamatan komunikasi antara peranti bagi memastikan data setiap restoran sentiasa terlindung dan terasing sepenuhnya.'
          ]
        },
        {
          heading: '2. Peningkatan Automasi Pembayaran Langganan',
          points: [
            'Penyelarasan sistem pembayaran digital bagi pakej sewaan 4, 8, dan 12 bulan secara automatik tanpa perlu pengesahan manual.'
          ]
        },
        {
          heading: '3. Sistem Maklum Balas & Notifikasi Pengurusan',
          points: [
            'Penambahbaikan ciri ulasan pelanggan dan integrasi notifikasi terus ke telefon pintar pihak pengurusan restoran.'
          ]
        }
      ]
    },
    {
      date: '10/08/2026',
      tag: 'Ciri-Ciri Utama & POS',
      isLatest: false,
      title: 'Pengurusan Kuota Pelan Percuma, Keserasian Pencetak Resit & Status Meja',
      items: [
        {
          heading: '1. Pengurusan Had Pesanan Pelan Percuma',
          points: [
            'Pelaksanaan had 100 pesanan percuma sebulan dengan sistem notifikasi kitaran penggunaan yang telus.'
          ]
        },
        {
          heading: '2. Keserasian Pencetak Resit Bluetooth (Thermal Printer)',
          points: [
            'Menyokong pelbagai model pencetak haba mudah alih (58mm & 80mm) dengan format teks dan kod QR yang kemas.'
          ]
        },
        {
          heading: '3. Panel Grid Meja Pintar Masa Nyata',
          points: [
            'Paparan status meja interaktif berkod warna di panel kaunter untuk memudahkan pemantauan operasi dewan makan.'
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
              <h3 className="font-black text-base sm:text-lg text-white">Log Kemas Kini Sistem</h3>
              <p className="text-xs text-slate-400 font-medium">Sejarah penambahbaikan & naik taraf ciri LajuQ SaaS</p>
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
                  <span className="text-white">Kemas Kini {log.date}</span>
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
                <div className="space-y-3 pt-2">
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
            Sistem LajuQ sentiasa dipantau & dikemas kini secara berkala demi menjamin prestasi terbaik.
          </div>

        </div>

        {/* Modal Footer */}
        <div className="bg-[#1A1F2B] px-6 py-3 border-t border-white/10 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400 font-mono">Status Sistem: <strong className="text-emerald-400">100% Beroperasi</strong></span>
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
