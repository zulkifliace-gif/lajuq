import React, { useState, useEffect } from 'react';
import { Search, X, PackageCheck, PackageX, RotateCcw, Save, CheckCircle2 } from 'lucide-react';
import { useOrder } from '../context/OrderContext';

export default function KDSStockModal({ isOpen, onClose }) {
  const { menuItems, menuStock, updateMenuStock } = useOrder();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'AVAILABLE' | 'OUT_OF_STOCK'
  const [expandedItemId, setExpandedItemId] = useState(null); // Stores itemKey of currently expanded option accordion (ONLY 1 OPEN AT A TIME)
  
  // Local state for stock changes before saving / instant updates
  const [draftStock, setDraftStock] = useState(() => menuStock || {});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Sync draftStock when menuStock changes from server/props
  useEffect(() => {
    setDraftStock(menuStock || {});
  }, [menuStock, isOpen]);

  // Lock background body scrolling when modal is open
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

  // Extract unique categories safely
  const categories = ['ALL', ...new Set((menuItems || []).map(i => i?.category).filter(Boolean))];

  // Helper to get stock info for item
  const getItemStockInfo = (item) => {
    const key = item.id || item.name;
    const stockData = draftStock[key] || draftStock[item.name] || {};
    return {
      status: stockData.status || 'AVAILABLE', // 'AVAILABLE' | 'OUT_OF_STOCK'
      stock_qty: stockData.stock_qty !== undefined ? stockData.stock_qty : null // null means unlimited
    };
  };

  // Quick Action: Set item status to OUT_OF_STOCK
  const handleSetOutOfStock = (item) => {
    const key = item.id || item.name;
    setDraftStock(prev => ({
      ...prev,
      [key]: { status: 'OUT_OF_STOCK', stock_qty: 0 }
    }));
  };

  // Quick Action: Set item status to AVAILABLE
  const handleSetAvailable = (item) => {
    const key = item.id || item.name;
    setDraftStock(prev => ({
      ...prev,
      [key]: { status: 'AVAILABLE', stock_qty: null }
    }));
  };

  // Change exact numeric stock quantity
  const handleQtyChange = (item, val) => {
    const key = item.id || item.name;
    if (val === '' || val === null) {
      setDraftStock(prev => ({
        ...prev,
        [key]: { status: 'AVAILABLE', stock_qty: null }
      }));
      return;
    }

    const qty = Number(val);
    if (isNaN(qty) || qty <= 0) {
      setDraftStock(prev => ({
        ...prev,
        [key]: { status: 'OUT_OF_STOCK', stock_qty: 0 }
      }));
    } else {
      setDraftStock(prev => ({
        ...prev,
        [key]: { status: 'AVAILABLE', stock_qty: qty }
      }));
    }
  };

  // Reset item stock to default (Available, unlimited)
  const handleResetItem = (item) => {
    const key = item.id || item.name;
    setDraftStock(prev => {
      const copy = { ...prev };
      delete copy[key];
      delete copy[item.name];
      return copy;
    });
  };

  // Save all draft stock changes
  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccessMsg('');
    try {
      if (updateMenuStock) {
        await updateMenuStock(draftStock);
      }
      setSaveSuccessMsg('Stok menu berjaya dikemas kini!');
      setTimeout(() => {
        setSaveSuccessMsg('');
        onClose();
      }, 1200);
    } catch (e) {
      console.error('Failed to save stock:', e);
    } finally {
      setIsSaving(false);
    }
  };

  // Filter items based on search, category, and status filter
  const filteredItems = (menuItems || []).filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (item.category || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;

    const info = getItemStockInfo(item);
    const isOut = info.status === 'OUT_OF_STOCK' || (info.stock_qty !== null && Number(info.stock_qty) <= 0);
    const matchesStatus = statusFilter === 'ALL' ? true :
                          statusFilter === 'OUT_OF_STOCK' ? isOut :
                          !isOut;

    return matchesSearch && matchesCat && matchesStatus;
  });

  const outOfStockCount = (menuItems || []).filter(i => {
    const info = getItemStockInfo(i);
    return info.status === 'OUT_OF_STOCK' || (info.stock_qty !== null && Number(info.stock_qty) <= 0);
  }).length;

  // Option / Add-on Stock Helpers
  const parseOptionGroups = (item) => {
    if (!item || !item.optionGroups) return [];
    if (Array.isArray(item.optionGroups)) return item.optionGroups;
    if (typeof item.optionGroups === 'string') {
      try {
        const parsed = JSON.parse(item.optionGroups);
        return Array.isArray(parsed) ? parsed : [];
      } catch(e) {
        return [];
      }
    }
    return [];
  };

  const getOptionStockKey = (item, optName) => {
    const itemKey = item.id || item.name;
    return `opt::${itemKey}::${optName}`;
  };

  const getOptionStockInfo = (item, optName) => {
    const key = getOptionStockKey(item, optName);
    const altKey = `opt::${item.name}::${optName}`;
    const stockData = draftStock[key] || draftStock[altKey] || {};
    return {
      status: stockData.status || 'AVAILABLE',
      stock_qty: stockData.stock_qty !== undefined ? stockData.stock_qty : null
    };
  };

  const handleSetOptionAvailable = (item, optName) => {
    const key = getOptionStockKey(item, optName);
    const altKey = `opt::${item.name}::${optName}`;
    setDraftStock(prev => ({
      ...prev,
      [key]: { status: 'AVAILABLE', stock_qty: null },
      [altKey]: { status: 'AVAILABLE', stock_qty: null }
    }));
  };

  const handleSetOptionOutOfStock = (item, optName) => {
    const key = getOptionStockKey(item, optName);
    const altKey = `opt::${item.name}::${optName}`;
    setDraftStock(prev => ({
      ...prev,
      [key]: { status: 'OUT_OF_STOCK', stock_qty: 0 },
      [altKey]: { status: 'OUT_OF_STOCK', stock_qty: 0 }
    }));
  };

  const handleOptionQtyChange = (item, optName, val) => {
    const key = getOptionStockKey(item, optName);
    const altKey = `opt::${item.name}::${optName}`;
    if (val === '' || val === null) {
      setDraftStock(prev => ({
        ...prev,
        [key]: { status: 'AVAILABLE', stock_qty: null },
        [altKey]: { status: 'AVAILABLE', stock_qty: null }
      }));
      return;
    }
    const qty = Number(val);
    if (isNaN(qty) || qty <= 0) {
      setDraftStock(prev => ({
        ...prev,
        [key]: { status: 'OUT_OF_STOCK', stock_qty: 0 },
        [altKey]: { status: 'OUT_OF_STOCK', stock_qty: 0 }
      }));
    } else {
      setDraftStock(prev => ({
        ...prev,
        [key]: { status: 'AVAILABLE', stock_qty: qty },
        [altKey]: { status: 'AVAILABLE', stock_qty: qty }
      }));
    }
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-[9999] bg-black/75 flex items-center justify-center p-2 sm:p-6 animate-fadeIn font-sans"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-[#FAF7EF] rounded-2xl sm:rounded-3xl w-[95vw] sm:w-full sm:max-w-4xl h-[85vh] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-black/20"
      >
        
        {/* STICKY MODAL HEADER */}
        <div className="shrink-0 bg-[#EDE7D8] px-4 sm:px-6 py-3.5 sm:py-4 border-b border-black/15 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#163F35] text-white flex items-center justify-center font-bold shadow-md shrink-0 text-base sm:text-lg">
              📦
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base sm:text-xl text-[#22262B] leading-tight truncate">
                Pengurusan Stok KDS (Menu & Add-on)
              </h2>
              <p className="text-[10px] sm:text-xs text-[#6B6F66] truncate hidden sm:block">
                Set stok menu & add-on real-time. Penukaran stok akan dikemas kini ke skrin pelanggan.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-black/5 hover:bg-black/10 text-[#22262B] font-bold text-sm transition cursor-pointer shrink-0 ml-2"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STICKY SEARCH & FILTER CONTROLS BAR */}
        <div className="shrink-0 p-3 sm:p-5 border-b border-black/10 bg-[#FAF7EF] space-y-2.5 sm:space-y-3 z-10">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            {/* SEARCH INPUT */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6F66]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari nama menu atau pilihan..."
                className="w-full pl-9 pr-9 py-2 bg-white border border-black/20 rounded-xl text-xs sm:text-sm font-semibold text-[#22262B] placeholder:text-[#6B6F66]/60 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6F66] hover:text-[#22262B] text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* STATUS FILTER PILLS */}
            <div className="flex items-center justify-between sm:justify-start gap-1 bg-[#EDE7D8] p-1 rounded-xl shrink-0 overflow-x-auto">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg transition whitespace-nowrap ${
                  statusFilter === 'ALL' ? 'bg-[#22262B] text-white shadow-xs' : 'text-[#6B6F66] hover:text-[#22262B]'
                }`}
              >
                Semua ({menuItems.length})
              </button>
              <button
                onClick={() => setStatusFilter('AVAILABLE')}
                className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg transition whitespace-nowrap ${
                  statusFilter === 'AVAILABLE' ? 'bg-[#163F35] text-white shadow-xs' : 'text-[#6B6F66] hover:text-[#22262B]'
                }`}
              >
                🟢 Ada ({menuItems.length - outOfStockCount})
              </button>
              <button
                onClick={() => setStatusFilter('OUT_OF_STOCK')}
                className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg transition whitespace-nowrap ${
                  statusFilter === 'OUT_OF_STOCK' ? 'bg-rose-600 text-white shadow-xs' : 'text-[#6B6F66] hover:text-[#22262B]'
                }`}
              >
                🔴 Habis ({outOfStockCount})
              </button>
            </div>
          </div>

          {/* CATEGORY FILTER PILLS */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[11px] sm:text-xs">
            {(categories || []).map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg font-bold transition shrink-0 cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#163F35] text-white'
                    : 'bg-white border border-black/15 text-[#6B6F66] hover:bg-[#EDE7D8]'
                }`}
              >
                {cat === 'ALL' ? 'Semua Kategori' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* ITEMS LIST AREA - SCROLLABLE WITH FLEX-1 MIN-H-0 AND TOUCH-ACTION PAN-Y */}
        <div 
          style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
          className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 divide-y divide-black/10 space-y-0 overscroll-contain"
        >
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-[#6B6F66] space-y-2">
              <PackageX className="w-10 h-10 mx-auto text-[#6B6F66]/40" />
              <p className="text-sm font-bold">Tiada item menu dijumpai.</p>
              <p className="text-xs">Cuba cari kata kunci lain atau tukar kategori filter.</p>
            </div>
          ) : (
            filteredItems.map(item => {
              const info = getItemStockInfo(item);
              const isOut = info.status === 'OUT_OF_STOCK' || (info.stock_qty !== null && Number(info.stock_qty) <= 0);
              const optionGroups = parseOptionGroups(item);
              const itemKey = item.id || item.name;
              const isExpanded = expandedItemId === itemKey;
              const totalOptionsCount = optionGroups.reduce((acc, g) => acc + (g.options ? g.options.length : 0), 0);

              return (
                <div
                  key={itemKey}
                  className={`py-3.5 px-3 rounded-2xl flex flex-col gap-2 transition ${
                    isOut ? 'bg-rose-50/90 border border-rose-200' : 'hover:bg-black/5'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* ITEM TEXT DETAILS */}
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-sm text-[#22262B] break-words">{item.name}</span>
                        <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-black/10 text-[#6B6F66]">
                          {item.category}
                        </span>
                        <span className="text-xs font-mono font-bold text-[#163F35]">
                          RM {Number(item.price || 0).toFixed(2)}
                        </span>
                      </div>

                      {item.description && (
                        <p className="text-xs text-[#6B6F66] line-clamp-1 italic">
                          {item.description}
                        </p>
                      )}

                      {/* DROPDOWN TOGGLE BUTTON FOR ADD-ONS */}
                      {optionGroups.length > 0 && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setExpandedItemId(prev => (prev === itemKey ? null : itemKey))}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 ${
                              isExpanded
                                ? 'bg-[#163F35] text-white shadow-sm'
                                : 'bg-[#EDE7D8] text-[#163F35] hover:bg-[#E3DBC7] border border-black/15'
                            }`}
                          >
                            <span>⚙️ Urus Add-on / Pilihan ({totalOptionsCount})</span>
                            <span className="text-[10px] font-black">{isExpanded ? '▲' : '▼'}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* STOCK CONTROL BUTTONS & TOUCH COUNTER INPUT */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap sm:flex-nowrap justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-black/10">
                      
                      {/* TOUCH COUNTER BAKI UNIT (+ / -) */}
                      <div className="flex items-center gap-1 bg-white border border-black/20 rounded-xl p-1 shadow-xs">
                        <span className="text-[10px] sm:text-[11px] font-bold text-[#6B6F66] px-1">Baki:</span>
                        
                        <button
                          type="button"
                          onClick={() => {
                            const current = info.stock_qty !== null ? Number(info.stock_qty) : 10;
                            handleQtyChange(item, Math.max(0, current - 1));
                          }}
                          className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-black/10 hover:bg-black/20 text-[#22262B] font-extrabold text-sm flex items-center justify-center transition active:scale-95 cursor-pointer"
                          title="Tolak 1 unit"
                        >
                          -
                        </button>

                        <input
                          type="number"
                          min="0"
                          placeholder="∞"
                          value={info.stock_qty === null ? '' : info.stock_qty}
                          onChange={(e) => handleQtyChange(item, e.target.value)}
                          className="w-12 sm:w-14 px-1 py-0.5 font-mono font-black text-xs sm:text-sm text-center border-b border-black/20 focus:outline-none focus:border-amber-500"
                        />

                        <button
                          type="button"
                          onClick={() => {
                            const current = info.stock_qty !== null ? Number(info.stock_qty) : 0;
                            handleQtyChange(item, current + 1);
                          }}
                          className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#163F35] hover:bg-[#12332B] text-white font-extrabold text-sm flex items-center justify-center transition active:scale-95 cursor-pointer shadow-xs"
                          title="Tambah 1 unit"
                        >
                          +
                        </button>
                      </div>

                      {/* STATUS QUICK TOGGLE BUTTONS */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSetAvailable(item)}
                          className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer active:scale-95 ${
                            !isOut
                              ? 'bg-[#163F35] text-white shadow-xs'
                              : 'bg-white border border-black/20 text-[#6B6F66] hover:bg-[#D9E5DF]'
                          }`}
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          <span>🟢 Ada</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSetOutOfStock(item)}
                          className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer active:scale-95 ${
                            isOut
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-white border border-black/20 text-[#6B6F66] hover:bg-rose-100'
                          }`}
                        >
                          <PackageX className="w-3.5 h-3.5" />
                          <span>🔴 Habis</span>
                        </button>

                        {(info.status !== 'AVAILABLE' || info.stock_qty !== null) && (
                          <button
                            type="button"
                            onClick={() => handleResetItem(item)}
                            className="p-2 text-[#6B6F66] hover:text-[#22262B] rounded-xl hover:bg-black/10 transition cursor-pointer"
                            title="Reset ke Asal (Ada - Tiada Had)"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* SUB-LIST ACCORDION DROPDOWN FOR ADD-ONS */}
                  {optionGroups.length > 0 && isExpanded && (
                    <div className="ml-2 sm:ml-6 mt-1 p-3 sm:p-4 bg-[#F4EFE0] rounded-2xl border-l-4 border-[#163F35] shadow-xs space-y-3 animate-fadeIn">
                      <div className="flex items-center justify-between border-b border-black/10 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#163F35] truncate">
                          <span>⚙️ Urus Add-on: "{item.name}"</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedItemId(null)}
                          className="text-xs font-bold text-[#6B6F66] hover:text-[#22262B] underline cursor-pointer shrink-0 ml-2"
                        >
                          Tutup ▲
                        </button>
                      </div>

                      <div className="space-y-3">
                        {optionGroups.map((grp, gIdx) => (
                          <div key={gIdx} className="space-y-2 bg-white/80 p-2.5 sm:p-3 rounded-xl border border-black/10">
                            <div className="text-xs font-extrabold text-[#22262B] flex items-center gap-1.5">
                              <span>• {grp.name}</span>
                              {grp.required && (
                                <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded font-bold">
                                  Wajib
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-0.5">
                              {(grp.options || []).map((optName, oIdx) => {
                                const optInfo = getOptionStockInfo(item, optName);
                                const isOptOut = optInfo.status === 'OUT_OF_STOCK' || (optInfo.stock_qty !== null && Number(optInfo.stock_qty) <= 0);

                                return (
                                  <div
                                    key={oIdx}
                                    className={`p-2.5 rounded-xl border flex flex-col sm:flex-row items-stretch sm:items-center justify-between text-xs gap-2 transition ${
                                      isOptOut ? 'bg-rose-100/90 border-rose-300 text-rose-900 font-bold' : 'bg-white border-black/15 text-[#22262B]'
                                    }`}
                                  >
                                    <span className={`font-bold truncate ${isOptOut ? 'line-through text-rose-800' : ''}`}>
                                      {optName}
                                    </span>

                                    <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0">
                                      {/* TOUCH COUNTER BAKI UNIT FOR OPTION */}
                                      <div className="flex items-center gap-0.5 bg-[#FAF7EF] border border-black/20 rounded-lg p-0.5">
                                        <span className="text-[9px] font-bold text-[#6B6F66] px-1">Baki:</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const current = optInfo.stock_qty !== null ? Number(optInfo.stock_qty) : 10;
                                            handleOptionQtyChange(item, optName, Math.max(0, current - 1));
                                          }}
                                          className="w-6 h-6 rounded bg-black/10 font-black text-xs flex items-center justify-center active:scale-95 cursor-pointer"
                                        >
                                          -
                                        </button>
                                        <input
                                          type="number"
                                          min="0"
                                          placeholder="∞"
                                          value={optInfo.stock_qty === null ? '' : optInfo.stock_qty}
                                          onChange={(e) => handleOptionQtyChange(item, optName, e.target.value)}
                                          className="w-9 px-0.5 py-0.5 font-mono font-bold text-xs text-center border-b border-black/20 focus:outline-none"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const current = optInfo.stock_qty !== null ? Number(optInfo.stock_qty) : 0;
                                            handleOptionQtyChange(item, optName, current + 1);
                                          }}
                                          className="w-6 h-6 rounded bg-[#163F35] text-white font-black text-xs flex items-center justify-center active:scale-95 cursor-pointer"
                                        >
                                          +
                                        </button>
                                      </div>

                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => handleSetOptionAvailable(item, optName)}
                                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                                            !isOptOut ? 'bg-[#163F35] text-white shadow-xs' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                          }`}
                                        >
                                          🟢 Ada
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSetOptionOutOfStock(item, optName)}
                                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                                            isOptOut ? 'bg-rose-600 text-white shadow-xs' : 'bg-gray-200 text-gray-600 hover:bg-rose-200 hover:text-rose-800'
                                          }`}
                                        >
                                          🔴 Habis
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="bg-[#EDE7D8] px-6 py-4 border-t border-black/15 flex items-center justify-between">
          <div className="text-xs font-bold text-[#6B6F66]">
            Menunjukkan {filteredItems.length} daripada {menuItems.length} menu item
          </div>

          {saveSuccessMsg ? (
            <div className="bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4" />
              <span>{saveSuccessMsg}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-[#22262B] border border-black/20 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Batal
              </button>

              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2.5 bg-[#163F35] hover:bg-[#12332B] text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Menyimpan...' : '💾 Simpan Stok'}</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
