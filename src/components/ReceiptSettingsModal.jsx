import React, { useState, useEffect } from 'react';
import { useOrder } from '../context/OrderContext';
import { X, Settings, Check, FileText, Printer, Building2, MessageSquare, Image, Upload, Trash2, Lock, LayoutGrid, Sparkles } from 'lucide-react';

export default function ReceiptSettingsModal({ isOpen, onClose }) {
  const { receiptSettings, updateReceiptSettings } = useOrder();
  const safeSettings = receiptSettings || {};

  const [paperWidth, setPaperWidth] = useState(safeSettings.paperWidth || '58mm');
  const [tableCount, setTableCount] = useState(safeSettings.tableCount || 20);
  const [headerTitle, setHeaderTitle] = useState(safeSettings.headerTitle || 'RESTORAN RASA SELERA');
  const [headerAddress, setHeaderAddress] = useState(safeSettings.headerAddress || 'No. 18, Jalan Telawi 3, Bangsar, 59100 Kuala Lumpur');
  const [footerMsg, setFooterMsg] = useState(safeSettings.footerMsg || 'Terima Kasih! Sila Datang Lagi.');
  const [logoUrl, setLogoUrl] = useState(safeSettings.logoUrl || null);
  const [staffPin, setStaffPin] = useState(safeSettings.staffPin || '1234');

  // Extra Charges & Tax State
  const [enableSst, setEnableSst] = useState(safeSettings.enableSst !== false);
  const [sstRate, setSstRate] = useState(safeSettings.sstRate !== undefined ? safeSettings.sstRate : 6);

  const [enableServiceCharge, setEnableServiceCharge] = useState(Boolean(safeSettings.enableServiceCharge));
  const [serviceChargeRate, setServiceChargeRate] = useState(safeSettings.serviceChargeRate !== undefined ? safeSettings.serviceChargeRate : 10);

  const [enableCustomCharge, setEnableCustomCharge] = useState(Boolean(safeSettings.enableCustomCharge));
  const [customChargeName, setCustomChargeName] = useState(safeSettings.customChargeName || 'Cas Tambahan');
  const [customChargeType, setCustomChargeType] = useState(safeSettings.customChargeType || 'RM');
  const [customChargeAmount, setCustomChargeAmount] = useState(safeSettings.customChargeAmount !== undefined ? safeSettings.customChargeAmount : 0);

  // Cas Bungkus (Takeaway Charge) State
  const [enableTakeawayCharge, setEnableTakeawayCharge] = useState(Boolean(safeSettings.enableTakeawayCharge));
  const [takeawayChargeType, setTakeawayChargeType] = useState(safeSettings.takeawayChargeType || 'RM');
  const [takeawayChargeAmount, setTakeawayChargeAmount] = useState(safeSettings.takeawayChargeAmount !== undefined ? safeSettings.takeawayChargeAmount : 0.50);

  // Operational Mode State ('POSTPAY' vs 'PREPAY')
  const [operationalMode, setOperationalMode] = useState(safeSettings.operationalMode || 'POSTPAY');

  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (receiptSettings) {
      setPaperWidth(receiptSettings.paperWidth || '58mm');
      setTableCount(receiptSettings.tableCount !== undefined ? Number(receiptSettings.tableCount) : 20);
      setHeaderTitle(receiptSettings.headerTitle || 'RESTORAN RASA SELERA');
      setHeaderAddress(receiptSettings.headerAddress || 'No. 18, Jalan Telawi 3, Bangsar, 59100 Kuala Lumpur');
      setFooterMsg(receiptSettings.footerMsg || 'Terima Kasih! Sila Datang Lagi.');
      setLogoUrl(receiptSettings.logoUrl || null);
      setStaffPin(receiptSettings.staffPin || '1234');

      setEnableSst(Boolean(receiptSettings.enableSst));
      setSstRate(receiptSettings.sstRate !== undefined ? receiptSettings.sstRate : 0);

      setEnableServiceCharge(Boolean(receiptSettings.enableServiceCharge));
      setServiceChargeRate(receiptSettings.serviceChargeRate !== undefined ? receiptSettings.serviceChargeRate : 0);

      setEnableCustomCharge(Boolean(receiptSettings.enableCustomCharge));
      setCustomChargeName(receiptSettings.customChargeName || 'Cas Tambahan');
      setCustomChargeType(receiptSettings.customChargeType || 'RM');
      setCustomChargeAmount(receiptSettings.customChargeAmount !== undefined ? receiptSettings.customChargeAmount : 0);

      setEnableTakeawayCharge(Boolean(receiptSettings.enableTakeawayCharge));
      setTakeawayChargeType(receiptSettings.takeawayChargeType || 'RM');
      setTakeawayChargeAmount(receiptSettings.takeawayChargeAmount !== undefined ? receiptSettings.takeawayChargeAmount : 0.50);

      setOperationalMode(receiptSettings.operationalMode || 'POSTPAY');
    }
  }, [receiptSettings, isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Sila pilih fail imej (PNG, JPG, WebP) sahaja.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setLogoUrl(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
  };

  const handleSave = (e) => {
    e.preventDefault();
    updateReceiptSettings({
      paperWidth,
      tableCount,
      headerTitle,
      headerAddress,
      footerMsg,
      logoUrl,
      staffPin,
      enableSst,
      sstRate: Number(sstRate),
      enableServiceCharge,
      serviceChargeRate: Number(serviceChargeRate),
      enableCustomCharge,
      customChargeName,
      customChargeType,
      customChargeAmount: Number(customChargeAmount),
      enableTakeawayCharge,
      takeawayChargeType,
      takeawayChargeAmount: Number(takeawayChargeAmount),
      operationalMode
    });
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 relative transform transition-all scale-100 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">Tetapan Resit & Cas Tambahan</h3>
              <p className="text-xs text-slate-400">Konfigurasi Logo, Saiz Kertas, SST & Cas Bungkus</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-6 text-xs overflow-y-auto flex-1">
          
          {/* Section 0: Operational Mode (Mod Operasi Restoran) */}
          <div className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
            <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-widest border-b border-slate-800 pb-1 flex items-center justify-between">
              <span>Mod Operasi Restoran (Aliran Pesanan & Bayaran)</span>
              <span className="text-[9px] font-mono text-slate-400">Penting</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Option A: POSTPAY (Makan Dahulu, Bayar Kemudian) */}
              <button
                type="button"
                onClick={() => setOperationalMode('POSTPAY')}
                className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                  operationalMode === 'POSTPAY'
                    ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-lg shadow-emerald-500/10'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-emerald-300">🍽️ Mod Makan Dahulu</span>
                  <input
                    type="radio"
                    checked={operationalMode === 'POSTPAY'}
                    onChange={() => setOperationalMode('POSTPAY')}
                    className="accent-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  Pesanan QR pelanggan <strong>dihantar terus ke dapur</strong> (KDS) untuk terus dimasak. Bayaran dibuat di kaunter selepas selesai makan.
                </p>
              </button>

              {/* Option B: PREPAY (Bayar Dahulu, Baru Masak) */}
              <button
                type="button"
                onClick={() => setOperationalMode('PREPAY')}
                className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                  operationalMode === 'PREPAY'
                    ? 'bg-rose-500/10 border-rose-500 text-white shadow-lg shadow-rose-500/10'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-rose-300">💳 Mod Bayar Dahulu</span>
                  <input
                    type="radio"
                    checked={operationalMode === 'PREPAY'}
                    onChange={() => setOperationalMode('PREPAY')}
                    className="accent-rose-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  Pesanan QR <strong>disimpan di kaunter dulu</strong> (KDS dapur tak muncul lagi). Pesanan hanya dihantar ke KDS sebaik sahaja bayaran disahkan!
                </p>
              </button>
            </div>
          </div>

          {/* Section 1: Logo & Printing */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest border-b border-slate-800 pb-1">
              1. Tetapan Cetakan & Logo Restoran
            </h4>

            {/* Logo Upload Section */}
            <div className="space-y-2">
              <label className="font-bold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Image className="w-4 h-4 text-blue-400" />
                  <span>Logo Resit Restoran</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Auto scaling mengikut saiz kertas</span>
              </label>

              {logoUrl ? (
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-white p-2 rounded-xl border border-slate-300 w-16 h-16 flex items-center justify-center shrink-0">
                      <img src={logoUrl} alt="Logo Preview" className="max-h-full max-w-full object-contain grayscale" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-200 block text-xs">Logo Aktif</span>
                      <span className="text-[10px] text-emerald-400 font-mono">Ready untuk cetakan thermal</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition flex items-center gap-1 text-xs"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Padam</span>
                  </button>
                </div>
              ) : (
                <label className="border-2 border-dashed border-slate-800 hover:border-blue-500/50 bg-slate-950/60 hover:bg-slate-950 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition text-center group">
                  <div className="p-3 rounded-full bg-slate-900 group-hover:bg-blue-500/10 text-slate-400 group-hover:text-blue-400 transition">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-300 text-xs block">Muat Naik Logo Restoran</span>
                    <span className="text-[10px] text-slate-500">Pilih fail PNG / JPG / WebP (Saranan: Hitam Putih)</span>
                  </div>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
              )}
            </div>

            {/* Paper Width Selection */}
            <div className="space-y-2">
              <label className="font-bold text-slate-300 flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-blue-400" />
                <span>Saiz Kertas Thermal Printer</span>
              </label>

              <div className="grid grid-cols-3 gap-2">
                {['58mm', '80mm', '72mm'].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setPaperWidth(size)}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1 ${
                      paperWidth === size
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-extrabold shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-sm font-mono font-bold">{size}</span>
                    <span className="text-[9px] opacity-75">
                      {size === '58mm' ? 'Portable (32 Col)' : size === '80mm' ? 'Standard (48 Col)' : 'Medium (42 Col)'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Header Title */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-300 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Nama Restoran di Header Resit</span>
              </label>
              <input
                type="text"
                value={headerTitle}
                onChange={(e) => setHeaderTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-white outline-none transition"
                required
              />
            </div>

            {/* Header Address */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <span>Alamat Restoran</span>
              </label>
              <input
                type="text"
                value={headerAddress}
                onChange={(e) => setHeaderAddress(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-white outline-none transition"
                required
              />
            </div>

            {/* Footer Message */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                <span>Mesej Ucapan Bawah Resit</span>
              </label>
              <input
                type="text"
                value={footerMsg}
                onChange={(e) => setFooterMsg(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-white outline-none transition"
                required
              />
            </div>
          </div>

          {/* Section 2: Extra Charges & Taxes (CUKAI & CAS TAMBAHAN) */}
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                2. Tetapan Cas Tambahan & Cukai
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">Boleh hidup/mati sebarang cas</span>
            </div>

            {/* Option A: SST / Cukai Perkhidmatan */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-200 text-xs">Cukai Perkhidmatan (SST)</p>
                  <p className="text-[11px] text-slate-500">Kira peratusan SST ke atas subtotal pesanan</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableSst(!enableSst)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${enableSst ? 'bg-emerald-500' : 'bg-slate-800'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-300 ${enableSst ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {enableSst && (
                <div className="pt-2 border-t border-slate-900 flex items-center justify-between gap-3">
                  <span className="text-slate-400 font-medium">Kadar SST (%):</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="30"
                      step="0.5"
                      value={sstRate}
                      onChange={(e) => setSstRate(e.target.value)}
                      className="w-24 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-1.5 text-center font-mono font-bold text-emerald-400 text-sm outline-none"
                    />
                    <span className="font-mono text-emerald-400 font-bold">%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Option B: Cas Perkhidmatan / Service Charge */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-200 text-xs">Cas Perkhidmatan (Service Charge)</p>
                  <p className="text-[11px] text-slate-500">Caj tambahan perkhidmatan restoran (cth: 10%)</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableServiceCharge(!enableServiceCharge)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${enableServiceCharge ? 'bg-indigo-500' : 'bg-slate-800'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-300 ${enableServiceCharge ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {enableServiceCharge && (
                <div className="pt-2 border-t border-slate-900 flex items-center justify-between gap-3">
                  <span className="text-slate-400 font-medium">Kadar Cas Servis (%):</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="30"
                      step="0.5"
                      value={serviceChargeRate}
                      onChange={(e) => setServiceChargeRate(e.target.value)}
                      className="w-24 bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-1.5 text-center font-mono font-bold text-indigo-400 text-sm outline-none"
                    />
                    <span className="font-mono text-indigo-400 font-bold">%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Option C: Cas Bungkus (Takeaway Charge) */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                    <span>🛍️ Cas Bungkus (Takeaway Charge)</span>
                  </p>
                  <p className="text-[11px] text-slate-500">Auto kenakan cas mengikut kuantiti item/bekas (cth: RM 0.50 x 5 item = RM 2.50) jika "Bungkus". Auto tolak jika Dine-In.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableTakeawayCharge(!enableTakeawayCharge)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${enableTakeawayCharge ? 'bg-amber-500' : 'bg-slate-800'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-300 ${enableTakeawayCharge ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {enableTakeawayCharge && (
                <div className="pt-3 border-t border-slate-900 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-400 text-[11px] font-bold">Jenis Cas:</label>
                    <select
                      value={takeawayChargeType}
                      onChange={(e) => setTakeawayChargeType(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white text-xs outline-none"
                    >
                      <option value="RM">Amaun Tetap (RM)</option>
                      <option value="%">Peratusan (%)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 text-[11px] font-bold">Amaun / Kadar:</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-amber-400 text-xs font-bold">
                        {takeawayChargeType === 'RM' ? 'RM' : '%'}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.10"
                        value={takeawayChargeAmount}
                        onChange={(e) => setTakeawayChargeAmount(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl pl-10 pr-3 py-2 text-white font-mono font-bold text-xs outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Option D: Cas Tambahan Custom */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-200 text-xs">Cas Tambahan Khas (Custom Charge)</p>
                  <p className="text-[11px] text-slate-500">Caj amaun tetap atau peratusan khas (cth: Delivery Fee)</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableCustomCharge(!enableCustomCharge)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${enableCustomCharge ? 'bg-rose-500' : 'bg-slate-800'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-300 ${enableCustomCharge ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {enableCustomCharge && (
                <div className="pt-3 border-t border-slate-900 space-y-3">
                  <div className="space-y-1">
                    <label className="text-slate-400 text-[11px] font-bold">Nama Cas / Penerangan di Resit:</label>
                    <input
                      type="text"
                      value={customChargeName}
                      onChange={(e) => setCustomChargeName(e.target.value)}
                      placeholder="Contoh: Cas Penghantaran / Delivery"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 rounded-xl px-3 py-2 text-white text-xs outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-slate-400 text-[11px] font-bold">Jenis Cas:</label>
                      <select
                        value={customChargeType}
                        onChange={(e) => setCustomChargeType(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 rounded-xl px-3 py-2 text-white text-xs outline-none"
                      >
                        <option value="RM">Amaun Tetap (RM)</option>
                        <option value="%">Peratusan (%)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-400 text-[11px] font-bold">Amaun / Kadar:</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-rose-400 text-xs font-bold">
                          {customChargeType === 'RM' ? 'RM' : '%'}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.10"
                          value={customChargeAmount}
                          onChange={(e) => setCustomChargeAmount(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 rounded-xl pl-10 pr-3 py-2 text-white font-mono font-bold text-xs outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Section 3: Grid Meja & Security PIN */}
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-widest border-b border-slate-800 pb-1">
              3. Grid Meja & Keselamatan Staf
            </h4>

            {/* Table Grid Count Setting */}
            <div className="space-y-2">
              <label className="font-bold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
                  <span>Bilangan Grid Meja Restoran</span>
                </span>
                <span className="text-[10px] text-amber-400 font-mono">Taip sebarang jumlah meja</span>
              </label>
              
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={tableCount}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(200, parseInt(e.target.value) || 1));
                    setTableCount(val);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-white font-mono font-bold text-sm outline-none transition"
                  placeholder="20"
                  required
                />
                <span className="text-xs font-bold text-slate-400 shrink-0">Meja</span>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500 font-bold">Pilihan Pantas:</span>
                {[10, 20, 30, 50, 100].map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    onClick={() => setTableCount(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                      tableCount === preset
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Staff PIN Security Setting */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-rose-400" />
                  <span>PIN Keselamatan Terminal Staf</span>
                </span>
                <span className="text-[10px] text-amber-400 font-mono">Default: 1234</span>
              </label>
              <input
                type="text"
                maxLength={4}
                value={staffPin}
                onChange={(e) => setStaffPin(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-3.5 py-2.5 text-white font-mono font-bold tracking-widest text-center text-sm outline-none transition"
                placeholder="1234"
                required
              />
            </div>
          </div>

          {savedSuccess && (
            <div className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 p-2.5 rounded-xl text-center font-bold flex items-center justify-center gap-2">
              <Check className="w-4 h-4" />
              <span>Tetapan Resit & Cas Tambahan Berjaya Disimpan!</span>
            </div>
          )}

          {/* Save Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-2xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition text-xs uppercase tracking-wider"
            >
              <Check className="w-4 h-4" />
              <span>Simpan Tetapan</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
