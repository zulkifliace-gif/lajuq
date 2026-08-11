import React, { useState, useEffect } from 'react';
import { useOrder } from '../context/OrderContext';
import { X, CheckCircle, Printer, AlertTriangle, Bluetooth, Loader2, XCircle } from 'lucide-react';
import { printReceiptBluetooth } from '../utils/bluetoothPrinter';
import { calculateReceiptTotals } from '../utils/receiptCalculator';
import { QRCodeSVG } from 'qrcode.react';

// Safe helper to parse items array
function getSafeItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try { return JSON.parse(items); } catch(e) { return []; }
  }
  return [];
}

export default function ReceiptModal({ isOpen, onClose, table, session, sessionOrders, onConfirmPayment, isConfirmingPayment }) {
  const { btDevice, cancelSession, receiptSettings } = useOrder();
  const [btPrinting, setBtPrinting] = useState(false);
  const [btStatusMsg, setBtStatusMsg] = useState('');

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

  if (!isOpen || !table || !session) return null;

  // Filter out cancelled orders so they are NOT billed to customer
  const validOrders = sessionOrders.filter(ord => ord.kitchen_status !== 'CANCELLED');

  // Flatten all un-cancelled items across valid orders under this session
  const allRawItems = validOrders.flatMap(ord => getSafeItems(ord.items));
  const activeItems = allRawItems.filter(item => !item.cancelled);

  const totalItemCount = activeItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);

  // Calculate subtotal & dynamic extra charges summing ONLY un-cancelled items
  const subtotal = validOrders.reduce((ordSum, ord) => {
    const uncancelledItems = getSafeItems(ord.items).filter(i => !i.cancelled);
    const orderItemsSum = uncancelledItems.reduce((iSum, i) => {
      const price = Number(i.price) || 0;
      const qty = Number(i.quantity) || 1;
      return iSum + (price * qty);
    }, 0);
    return ordSum + orderItemsSum;
  }, 0);

  const takeawayOrders = validOrders.filter(ord => ord.order_type === 'TAKEAWAY');
  const hasTakeawayOrder = takeawayOrders.length > 0;

  const takeawaySubtotal = takeawayOrders.reduce((ordSum, ord) => {
    const uncancelledItems = getSafeItems(ord.items).filter(i => !i.cancelled);
    const orderItemsSum = uncancelledItems.reduce((iSum, i) => {
      const price = Number(i.price) || 0;
      const qty = Number(i.quantity) || 1;
      return iSum + (price * qty);
    }, 0);
    return ordSum + orderItemsSum;
  }, 0);

  const takeawayItemCount = takeawayOrders.flatMap(ord => getSafeItems(ord.items)).filter(i => !i.cancelled).reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);

  const totals = calculateReceiptTotals(subtotal, receiptSettings, { 
    isTakeaway: hasTakeawayOrder,
    itemCount: totalItemCount,
    takeawayItemCount,
    takeawaySubtotal
  });
  const { sstAmount, serviceChargeAmount, customChargeFinal, takeawayChargeFinal, grandTotal } = totals;

  // Check if any order is still PENDING or COOKING
  const hasUnfinishedOrders = validOrders.some(ord => ord.kitchen_status === 'PENDING' || ord.kitchen_status === 'COOKING');

  const handleStandardPrint = () => {
    window.print();
  };

  // Centralized Bluetooth Direct Thermal Print Handler
  const handleBluetoothPrint = async () => {
    if (!btDevice) return;

    setBtPrinting(true);
    setBtStatusMsg('Mencetak resit ke Bluetooth Printer...');

    try {
      await printReceiptBluetooth(btDevice, {
        tableNumber: table.table_number,
        sessionId: session.session_id,
        accessToken: session.access_token,
        sessionOrders: validOrders,
        items: activeItems,
        subtotal: Number(subtotal) || 0,
        totals,
        tax: Number(sstAmount) || 0,
        totalAmount: Number(grandTotal) || 0
      }, receiptSettings);
      setBtStatusMsg('Resit berjaya dicetak! 📄');
    } catch (err) {
      console.error(err);
      setBtStatusMsg('Ralat semasa mencetak. Sila semak printer Bluetooth.');
    } finally {
      setBtPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="bg-slate-800/80 px-6 py-4 border-b border-slate-700/60 flex items-center justify-between shrink-0">
          <div>
            <span className="text-xs text-rose-400 font-bold uppercase tracking-wider">Penyata Bayaran / POS Checkout</span>
            <h3 className="font-bold text-xl text-slate-100">MEJA {table.table_number}</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Receipt Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 font-sans" id="printable-receipt">
          
          {/* Centralized Bluetooth Status Indicator */}
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Bluetooth className={`w-4 h-4 ${btDevice ? 'text-blue-400 animate-pulse' : 'text-slate-600'}`} />
              <span className={`font-semibold ${btDevice ? 'text-emerald-400' : 'text-slate-500'}`}>
                {btDevice ? `Status BT: Disambung (${btDevice.name})` : 'Status BT: Belum Disambung'}
              </span>
            </div>

            {/* Print BT Receipt Button - Greyed out if btDevice is null! */}
            <button
              onClick={handleBluetoothPrint}
              disabled={!btDevice || btPrinting || sessionOrders.length === 0}
              className={`px-3 py-1.5 font-bold rounded-xl text-xs flex items-center gap-1 transition ${
                btDevice 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 active:scale-95 cursor-pointer' 
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
              }`}
              title={!btDevice ? 'Sila sambung Bluetooth di Header Kaunter terlebih dahulu' : 'Cetak Resit ke Bluetooth Printer'}
            >
              {btPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              <span>{btDevice ? 'Cetak BT Resit 🖨️' : 'Cetak BT Resit (Kelabu)'}</span>
            </button>
          </div>

          {!btDevice && (
            <div className="text-[11px] text-amber-400 font-mono text-center bg-amber-500/10 p-2 rounded-xl border border-amber-500/20">
              💡 Petua: Tekan "🔌 Sambung Printer Bluetooth" di Header Kaunter untuk mengaktifkan butang cetakan Bluetooth.
            </div>
          )}

          {btStatusMsg && (
            <div className="text-[11px] text-blue-400 font-mono text-center bg-blue-500/10 p-2 rounded-xl border border-blue-500/20">
              {btStatusMsg}
            </div>
          )}

          {/* Header Info */}
          <div className="text-center border-b border-dashed border-slate-700/80 pb-4 space-y-1">
            {receiptSettings?.logoUrl && (
              <div className="flex justify-center pb-2">
                <img
                  src={receiptSettings.logoUrl}
                  alt="Logo Restoran"
                  className={`object-contain grayscale bg-white p-1.5 rounded-xl shadow-sm ${
                    receiptSettings?.paperWidth === '80mm' ? 'max-w-[180px] max-h-24' :
                    receiptSettings?.paperWidth === '72mm' ? 'max-w-[150px] max-h-20' :
                    'max-w-[120px] max-h-16'
                  }`}
                />
              </div>
            )}
            <h2 className="text-lg font-extrabold text-slate-100 tracking-wide">{receiptSettings?.headerTitle || 'RESTORAN RASA SELERA'}</h2>
            <p className="text-xs text-slate-400">{receiptSettings?.headerAddress || 'No. 18, Jalan Telawi 3, Bangsar, 59100 Kuala Lumpur'}</p>
            <div className="mt-2 text-xs font-mono text-slate-400 flex items-center justify-center gap-3">
              <span>Sesi ID: <strong className="text-slate-200">{session.session_id}</strong></span>
              <span>•</span>
              <span>Tarikh: {new Date(session.created_at).toLocaleDateString('ms-MY')}</span>
            </div>
            {/* Customer Names Row */}
            {(() => {
              const names = Array.from(new Set(sessionOrders.map(o => o.customer_name).filter(Boolean)));
              if (names.length === 0) return null;
              return (
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full text-xs font-bold text-rose-300">
                  👤 Pelanggan ({names.length}): <span className="text-white font-extrabold">{names.join(', ')}</span>
                </div>
              );
            })()}
          </div>

          {/* Warning if orders still cooking */}
          {hasUnfinishedOrders && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-center gap-3 text-amber-400 text-xs">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Perhatian: Terdapat pesanan yang masih dimasak di dapur. Anda masih boleh membuat bayaran.</span>
            </div>
          )}

          {/* Orders Breakdown */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Senarai Pesanan ({sessionOrders.length} Pesanan)</h4>
            
            {sessionOrders.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-sm italic">
                Belum ada pesanan dihantar oleh pelanggan di meja ini.
              </div>
            ) : (
              sessionOrders.map((ord) => {
                const isCancelled = ord.kitchen_status === 'CANCELLED';
                return (
                  <div key={ord.order_id} className={`rounded-xl p-3.5 border space-y-2 ${
                    isCancelled 
                      ? 'bg-rose-500/10 border-rose-500/30 text-slate-400' 
                      : 'bg-slate-950/60 border-slate-800/80'
                  }`}>
                    <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-mono font-semibold ${isCancelled ? 'text-rose-400 line-through' : 'text-rose-400'}`}>{ord.order_id}</span>
                        {ord.customer_name && (
                          <span className="text-[11px] font-bold text-slate-200 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md">
                            👤 {ord.customer_name}
                          </span>
                        )}
                        {ord.order_type === 'TAKEAWAY' && (
                          <span className="text-[10px] font-extrabold text-amber-950 bg-amber-400 px-2 py-0.5 rounded-md border border-amber-300">
                            🛍️ BUNGKUS
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-[10px]">
                          {new Date(ord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          isCancelled ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
                          ord.kitchen_status === 'READY' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          ord.kitchen_status === 'COOKING' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          'bg-slate-700 text-slate-300'
                        }`}>
                          {isCancelled ? '❌ DIBATALKAN (DAPUR)' : ord.kitchen_status}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      {getSafeItems(ord.items).map((item, itemIdx) => {
                        const isItemCancelled = isCancelled || item.cancelled === true;
                        return (
                          <div key={itemIdx} className={`flex justify-between items-start text-xs p-1 rounded-md transition ${isItemCancelled ? 'bg-rose-500/10' : ''}`}>
                            <div className="space-y-0.5 max-w-[75%] break-words">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className={`font-semibold break-words leading-snug ${isItemCancelled ? 'line-through text-slate-400' : 'text-slate-200'}`}>
                                  <span className="text-rose-400 font-bold">{item.quantity}x</span> {item.name}
                                </p>
                                {isItemCancelled && (
                                  <span className="bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[9px] font-bold px-1.5 py-0.2 rounded uppercase">
                                    Dibatalkan ❌
                                  </span>
                                )}
                              </div>
                              {item.options && (
                                <p className={`text-[11px] text-slate-400 italic break-words ${isItemCancelled ? 'line-through' : ''}`}>↳ {item.options}</p>
                              )}
                              {isItemCancelled && item.cancel_reason && (
                                <p className="text-[10px] text-rose-400 italic">Sebab: {item.cancel_reason}</p>
                              )}
                            </div>
                            <span className={`font-mono ${isItemCancelled ? 'line-through text-rose-400' : 'text-slate-300'}`}>
                              {isItemCancelled ? 'DITOLAK (RM 0.00)' : `RM ${(item.price * item.quantity).toFixed(2)}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {isCancelled && ord.kitchen_cancel_reason && (
                      <p className="text-[10px] text-rose-400 italic pt-1 border-t border-rose-500/20 font-mono">
                        Sebab Batal: "{ord.kitchen_cancel_reason}"
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Pricing Totals */}
          {sessionOrders.length > 0 && (
            <div className="border-t border-slate-800 pt-4 space-y-2 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span>RM {subtotal.toFixed(2)}</span>
              </div>

              {/* SST (if enabled) */}
              {totals.enableSst && (
                <div className="flex justify-between text-slate-400">
                  <span>Cukai Perkhidmatan (SST {totals.sstRate}%)</span>
                  <span>RM {sstAmount.toFixed(2)}</span>
                </div>
              )}

              {/* Service Charge (if enabled) */}
              {totals.enableServiceCharge && (
                <div className="flex justify-between text-slate-400">
                  <span>Cas Perkhidmatan ({totals.serviceChargeRate}%)</span>
                  <span>RM {serviceChargeAmount.toFixed(2)}</span>
                </div>
              )}

              {/* Custom Charge (if enabled) */}
              {totals.enableCustomCharge && (
                <div className="flex justify-between text-slate-400">
                  <span>{totals.customChargeName} {totals.customChargeType === '%' ? `(${totals.customChargeAmountVal}%)` : ''}</span>
                  <span>RM {customChargeFinal.toFixed(2)}</span>
                </div>
              )}

              {/* Takeaway Charge / Cas Bungkus (if enabled & takeaway order) */}
              {totals.enableTakeawayCharge && totals.isTakeaway && totals.takeawayChargeFinal > 0 && (
                <div className="flex justify-between text-amber-400 font-bold">
                  <span>🛍️ Cas Bungkus ({totals.takeawayChargeType === 'RM' ? `RM ${totals.takeawayChargeAmountVal.toFixed(2)}${totals.takeawayItemCount > 1 ? ` x ${totals.takeawayItemCount}` : ''}` : `${totals.takeawayChargeAmountVal}%`})</span>
                  <span>RM {takeawayChargeFinal.toFixed(2)}</span>
                </div>
              )}

              <div className="border-t border-slate-700 pt-2 flex justify-between items-center text-base font-sans font-extrabold text-white">
                <span className="text-slate-200">JUMLAH BAYARAN</span>
                <span className="text-emerald-400 text-xl font-mono">RM {grandTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* DYNAMIC SESSION QR CODE & 15-WORD FEEDBACK INVITATION */}
          {(() => {
            const baseUrl = window.location.origin;
            const cleanSessionId = String(session.session_id || '').replace(/^SES-/, '');
            const tid = localStorage.getItem('fb_tenant_id') || '';
            const accessToken = session.access_token || '';
            const dynamicSessionUrl = `${baseUrl}/o?t=${table.table_number}&s=${cleanSessionId}${tid ? '&tid=' + tid : ''}${accessToken ? '&token=' + accessToken : ''}`;

            return (
              <div className="border-t border-dashed border-slate-700/80 pt-4 mt-4 text-center flex flex-col items-center justify-center space-y-2">
                <div className="bg-white p-2.5 rounded-2xl shadow-sm inline-block">
                  <QRCodeSVG
                    value={dynamicSessionUrl}
                    size={110}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <p className="text-[11px] sm:text-xs text-slate-300 font-medium max-w-[280px] leading-relaxed text-center font-sans">
                  Bagaimana dengan sajian? Berkongsi dengan kami scan QR untuk berikan maklum balas anda hari ini!
                </p>
              </div>
            );
          })()}

        </div>

        {/* Action Footer */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                if (window.confirm(`Adakah anda pasti untuk membatalkan sesi Meja ${table.table_number}? Status meja akan dikosongkan.`)) {
                  cancelSession(session.session_id, table.table_number);
                  onClose();
                }
              }}
              className="py-3 px-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold rounded-xl border border-rose-500/30 flex items-center justify-center gap-1.5 transition text-xs"
              title="Batal / Void Sesi Meja Ini"
            >
              <XCircle className="w-4 h-4" />
              <span>Batal Sesi / Void</span>
            </button>

            <button
              onClick={handleStandardPrint}
              disabled={sessionOrders.length === 0}
              className="py-3 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition text-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Standard</span>
            </button>
          </div>

          <button
            onClick={() => onConfirmPayment(session.session_id, table.table_number)}
            disabled={sessionOrders.length === 0 || isConfirmingPayment}
            className={`w-full sm:w-auto flex-1 py-3 px-4 font-extrabold rounded-xl shadow-lg flex items-center justify-center gap-2 transition transform active:scale-95 text-xs ${
              isConfirmingPayment
                ? 'bg-emerald-800 text-emerald-300 cursor-not-allowed opacity-70'
                : 'bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-emerald-600/30'
            }`}
          >
            {isConfirmingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            <span>{isConfirmingPayment ? 'Sedang Proses...' : '💳 Sahkan Bayaran'}</span>
          </button>
        </div>

        {/* STAFF DIRECT ORDER / WALK-IN BUTTON */}
        <div className="bg-slate-950 px-6 py-3 border-t border-slate-800/60">
          <button
            onClick={() => {
              const url = `/order?table=${table.table_number}&session=${session.session_id}&name=STAFFORDER`;
              window.open(url, '_blank');
            }}
            className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-2xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
          >
            <span>[ + Pesanan Staf / Walk-in ]</span>
          </button>
        </div>

      </div>
    </div>
  );
}
