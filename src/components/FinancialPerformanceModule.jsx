import React, { useState, useMemo } from 'react';
import { useOrder } from '../context/OrderContext';
import ModuleErrorBoundary from './ModuleErrorBoundary';
import { 
  DollarSign, TrendingUp, ShoppingBag, Award, AlertCircle, ChevronRight, ChevronLeft, ChevronDown,
  FileSpreadsheet, Printer, Calendar, Search, Filter, PieChart, ArrowUpRight, ArrowDownRight,
  Sparkles, CheckCircle2, Clock, Utensils, Tag, ShieldCheck, Download, Send, X
} from 'lucide-react';
import { calculateReceiptTotals, roundMoney } from '../utils/receiptCalculator';

// Robust helper to parse and normalize items array from various JSON formats / property names
function getSafeItems(ord) {
  if (!ord) return [];
  let raw = ord;
  if (typeof ord === 'object' && !Array.isArray(ord)) {
    raw = ord.items || ord.cart_items || ord.order_items || [];
  }
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch(e) { raw = []; }
  }
  if (!Array.isArray(raw)) return [];

  return raw.map(i => {
    if (!i || typeof i !== 'object') return null;
    const priceVal = Number(i.price ?? i.unit_price ?? i.amount ?? 0);
    const qtyVal = Number(i.quantity ?? i.qty ?? i.count ?? 1);
    return {
      ...i,
      id: i.id || i.item_id || i.menu_id || i.name,
      name: i.name || i.title || i.item_name || 'Menu',
      price: isNaN(priceVal) ? 0 : priceVal,
      quantity: isNaN(qtyVal) || qtyVal <= 0 ? 1 : qtyVal,
      category: i.category || 'Umum',
      cancelled: Boolean(i.cancelled || i.is_cancelled)
    };
  }).filter(Boolean);
}

// Robust helper to parse SQLite UTC timestamps without local timezone corruption
function parseSafeDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
  let str = String(ts).trim();

  // If SQLite timestamp format "YYYY-MM-DD HH:MM:SS" (UTC without 'Z')
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
    str = str.replace(' ', 'T') + 'Z';
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(str)) {
    str = str + 'Z';
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// Malaysian Local Timezone Date Formatter (Asia/Kuala_Lumpur -> 'YYYY-MM-DD')
function getMYDateStr(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  try {
    return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  } catch (e) {
    return dateObj.toISOString().split('T')[0];
  }
}

const TIMEFRAMES = [
  { id: 'DAILY', label: '📅 Harian (Hari Ini)', icon: '📆' },
  { id: 'WEEKLY', label: '📅 Mingguan (7 Hari Terakhir)', icon: '🗓️' },
  { id: 'MONTHLY', label: '📅 Bulanan (30 Hari Terakhir)', icon: '📊' },
  { id: 'YEARLY', label: '📅 Tahunan (Tahun Ini)', icon: '📈' }
];

export default function FinancialPerformanceModule() {
  const { orders = [], sessions = {}, menuItems = [], receiptSettings = {}, feedbacks = [], updateReceiptSettings } = useOrder();

  // Timeframe Slider Index State (0: Harian, 1: Mingguan, 2: Bulanan, 3: Tahunan)
  const [timeframeIdx, setTimeframeIdx] = useState(0);
  const currentTimeframe = TIMEFRAMES[timeframeIdx] || TIMEFRAMES[0];

  // Zero-Order Items Filter State ('DAILY' | 'WEEKLY' | 'MONTHLY')
  const [zeroOrderFilter, setZeroOrderFilter] = useState('DAILY');

  // Search & Filter State for Paid Transactions List
  const [txSearchQuery, setTxSearchQuery] = useState('');
  const [txFilterDate, setTxFilterDate] = useState('');

  // Expanded Paid Transactions Accordion State
  const [expandedTxIds, setExpandedTxIds] = useState(new Set());

  // Feedback Popup Modal & 15/Page Mini-Pagination State
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackModalPage, setFeedbackModalPage] = useState(1);

  // Paid Transactions Popup Modal & 15/Page Mini-Pagination State
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txModalPage, setTxModalPage] = useState(1);

  // Telegram Bot Integration Modal State
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(() => Boolean(receiptSettings?.telegramEnabled));
  const [telegramBotToken, setTelegramBotToken] = useState(() => receiptSettings?.telegramBotToken || '');
  const [telegramChatId, setTelegramChatId] = useState(() => receiptSettings?.telegramChatId || '');
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const [telegramStatusMsg, setTelegramStatusMsg] = useState(null);

  // Sync state when receiptSettings changes from context
  React.useEffect(() => {
    setTelegramEnabled(Boolean(receiptSettings?.telegramEnabled));
    setTelegramBotToken(receiptSettings?.telegramBotToken || '');
    setTelegramChatId(receiptSettings?.telegramChatId || '');
  }, [receiptSettings?.telegramEnabled, receiptSettings?.telegramBotToken, receiptSettings?.telegramChatId]);

  // UNIFIED SCROLL LOCK EFFECT WHEN ANY MODAL IS OPEN
  React.useEffect(() => {
    if (isTelegramModalOpen || isFeedbackModalOpen || isTxModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isTelegramModalOpen, isFeedbackModalOpen, isTxModalOpen]);

  const handleTestTelegram = async () => {
    if (!telegramBotToken.trim() || !telegramChatId.trim()) {
      setTelegramStatusMsg({ type: 'error', text: '⚠️ Sila isi Bot Token dan Chat ID / Channel ID terlebih dahulu.' });
      return;
    }

    setIsTestingTelegram(true);
    setTelegramStatusMsg(null);

    try {
      const port = window.location.port;
      const isLocalDev = port === '3000' || port === '5173';
      const BACKEND_URL = isLocalDev ? `http://${window.location.hostname}:5000` : window.location.origin;

      const res = await fetch(`${BACKEND_URL}/api/telegram/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramBotToken: telegramBotToken.trim(),
          telegramChatId: telegramChatId.trim()
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === 'OK') {
        setTelegramStatusMsg({ type: 'success', text: '🎉 Ujian Sambungan Berjaya! Sila semak mesej ujian di Telegram anda.' });
      } else {
        setTelegramStatusMsg({ type: 'error', text: `❌ ${data.message || 'Gagal berhubung dengan Telegram API.'}` });
      }
    } catch (err) {
      setTelegramStatusMsg({ type: 'error', text: `❌ Ralat Rangkaian: ${err.message}` });
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleSaveTelegram = async () => {
    setIsSavingTelegram(true);
    setTelegramStatusMsg(null);

    try {
      const newSettings = {
        telegramEnabled,
        telegramBotToken: telegramBotToken.trim(),
        telegramChatId: telegramChatId.trim()
      };

      if (updateReceiptSettings) {
        await updateReceiptSettings(newSettings);
      }

      setTelegramStatusMsg({ type: 'success', text: '✅ Tetapan Telegram Bot berjaya disimpan ke database!' });
      setTimeout(() => {
        setIsTelegramModalOpen(false);
      }, 1500);
    } catch (err) {
      setTelegramStatusMsg({ type: 'error', text: `❌ Gagal menyimpan tetapan: ${err.message}` });
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const toggleTxExpand = (orderId) => {
    setExpandedTxIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // LHDN Export Date Range State
  const [lhdnStartDate, setLhdnStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // 1st of current month
    return getMYDateStr(d);
  });
  const [lhdnEndDate, setLhdnEndDate] = useState(() => getMYDateStr(new Date()));

  const handleNextTimeframe = () => {
    setTimeframeIdx((prev) => (prev + 1) % TIMEFRAMES.length);
  };

  const handlePrevTimeframe = () => {
    setTimeframeIdx((prev) => (prev - 1 + TIMEFRAMES.length) % TIMEFRAMES.length);
  };

  // Master Unified Status Alignment (No Duplicate Entries): WHERE status IN ('PAID', 'COMPLETED', 'SERVED', 'READY') or session CLOSED
  const paidOrders = useMemo(() => {
    const seenOrderIds = new Set();
    return (orders || []).filter(ord => {
      if (!ord || !ord.order_id) return false;
      if (seenOrderIds.has(ord.order_id)) return false; // DEDUPLICATION GUARD — NO DUPLICATE ENTRY!

      const kitchenStat = String(ord.kitchen_status || '').toUpperCase();
      if (kitchenStat === 'CANCELLED') return false;

      const payStat = String(ord.payment_status || '').toUpperCase();
      const isPaidStatus = payStat === 'PAID' || payStat === 'COMPLETED' || ord.is_paid === true;
      const isServedOrCompleted = kitchenStat === 'SERVED' || kitchenStat === 'COMPLETED' || kitchenStat === 'READY';
      const isSessionClosed = sessions && ord.session_id && sessions?.[ord.session_id]?.status === 'CLOSED';

      const isMatch = isPaidStatus || isServedOrCompleted || isSessionClosed;
      if (isMatch) {
        seenOrderIds.add(ord.order_id);
        return true;
      }
      return false;
    });
  }, [orders, sessions]);

  // Helper: Filter orders by date range safely using Asia/Kuala_Lumpur local timezone
  const filterOrdersByTimeframe = (orderList, timeframeKey) => {
    const now = new Date();
    const todayMYStr = getMYDateStr(now);

    return (orderList || []).filter(ord => {
      if (!ord) return false;
      const ts = ord.timestamp || ord.created_at || ord.date;
      const orderDate = parseSafeDate(ts);
      if (!orderDate) return false;

      const orderMYStr = getMYDateStr(orderDate);

      if (timeframeKey === 'DAILY') {
        return orderMYStr === todayMYStr;
      }

      const diffTime = now.getTime() - orderDate.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);

      if (timeframeKey === 'WEEKLY') {
        return diffDays >= -1 && diffDays <= 7;
      }
      if (timeframeKey === 'MONTHLY') {
        return diffDays >= -1 && diffDays <= 30;
      }
      if (timeframeKey === 'YEARLY') {
        const orderYear = orderDate.toLocaleDateString('en-US', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric' });
        const nowYear = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric' });
        return orderYear === nowYear;
      }
      return true;
    });
  };

  // Current Timeframe Orders
  const currentRangeOrders = useMemo(() => {
    return filterOrdersByTimeframe(paidOrders, currentTimeframe.id);
  }, [paidOrders, currentTimeframe]);

  // EMERGENCY FALLBACK: Direct calculation target orders
  // If currentRangeOrders has records, use it; otherwise fallback to paidOrders so data NEVER shows 0 when records exist
  const activeOrdersForMetrics = useMemo(() => {
    if (currentRangeOrders.length > 0) return currentRangeOrders;
    return paidOrders;
  }, [currentRangeOrders, paidOrders]);

  // Financial Stats Calculation (Direct Frontend Calculation)
  const financialMetrics = useMemo(() => {
    let totalRevenue = 0;
    let netSalesSubtotal = 0;
    let totalTakeawayCharges = 0;
    let totalSst = 0;
    let totalServiceCharge = 0;

    activeOrdersForMetrics.forEach(ord => {
      const items = getSafeItems(ord).filter(i => !i.cancelled);
      const subtotal = roundMoney(items.reduce((sum, i) => sum + (i.price * i.quantity), 0));
      const isTakeaway = ord.order_type === 'TAKEAWAY';
      const totalItemsCount = items.reduce((sum, i) => sum + i.quantity, 0);

      const calc = calculateReceiptTotals(subtotal, receiptSettings, {
        isTakeaway,
        itemCount: totalItemsCount,
        takeawayItemCount: isTakeaway ? totalItemsCount : 0,
        takeawaySubtotal: isTakeaway ? subtotal : 0
      });

      netSalesSubtotal = roundMoney(netSalesSubtotal + subtotal);
      totalTakeawayCharges = roundMoney(totalTakeawayCharges + (calc.takeawayChargeFinal || 0));
      totalSst = roundMoney(totalSst + (calc.sstAmount || 0));
      totalServiceCharge = roundMoney(totalServiceCharge + (calc.serviceChargeAmount || 0));
      totalRevenue = roundMoney(totalRevenue + (calc.grandTotal || (subtotal + (calc.takeawayChargeFinal || 0))));
    });

    const totalOrdersCount = activeOrdersForMetrics.length;
    const aov = totalOrdersCount > 0 ? roundMoney(totalRevenue / totalOrdersCount) : 0;

    return {
      totalRevenue,
      netSalesSubtotal,
      totalTakeawayCharges,
      totalSst,
      totalServiceCharge,
      totalOrdersCount,
      aov
    };
  }, [activeOrdersForMetrics, receiptSettings]);

  // Item Popularity Ranking (Top Sellers & Bottom Sellers calculated directly)
  const itemPopularityStats = useMemo(() => {
    const statsMap = {}; // itemId / itemKey -> { name, category, quantity, revenue }

    activeOrdersForMetrics.forEach(ord => {
      const items = getSafeItems(ord).filter(i => !i.cancelled);
      items.forEach(it => {
        const key = it.id || (it.name ? it.name.trim() : 'item');
        if (!statsMap[key]) {
          statsMap[key] = {
            id: key,
            name: it.name || 'Menu',
            category: it.category || 'Umum',
            quantity: 0,
            revenue: 0
          };
        }
        statsMap[key].quantity += it.quantity;
        statsMap[key].revenue = roundMoney(statsMap[key].revenue + (it.price * it.quantity));
      });
    });

    const sortedList = Object.values(statsMap).sort((a, b) => b.quantity - a.quantity);
    const topSellers = sortedList.slice(0, 5);
    const bottomSellers = sortedList.filter(i => i.quantity > 0).slice(-5).reverse();

    return { sortedList, topSellers, bottomSellers };
  }, [activeOrdersForMetrics]);

  // Zero-Order Items Query (Direct Left Join equivalent between menuItems and active orders)
  const zeroOrderItems = useMemo(() => {
    const rangeOrders = filterOrdersByTimeframe(paidOrders, zeroOrderFilter);
    const targetOrders = rangeOrders.length > 0 ? rangeOrders : paidOrders;
    const orderedKeys = new Set();

    targetOrders.forEach(ord => {
      const items = getSafeItems(ord).filter(i => !i.cancelled);
      items.forEach(it => {
        if (it.id) orderedKeys.add(String(it.id));
        if (it.name) orderedKeys.add(String(it.name).trim().toLowerCase());
      });
    });

    return (menuItems || []).filter(item => {
      if (!item) return false;
      const keyId = item.id ? String(item.id) : null;
      const keyName = item.name ? String(item.name).trim().toLowerCase() : null;

      const hasOrderedId = keyId && orderedKeys.has(keyId);
      const hasOrderedName = keyName && orderedKeys.has(keyName);

      return !hasOrderedId && !hasOrderedName;
    });
  }, [paidOrders, menuItems, zeroOrderFilter]);

  // Filtered Paid Transactions Journal
  const filteredPaidTransactions = useMemo(() => {
    return paidOrders.filter(ord => {
      const q = txSearchQuery.trim().toLowerCase();
      const matchSearch = !q ||
        (ord.order_id && ord.order_id.toLowerCase().includes(q)) ||
        (ord.customer_name && ord.customer_name.toLowerCase().includes(q)) ||
        (ord.table_number && String(ord.table_number).includes(q));

      let matchDate = true;
      if (txFilterDate) {
        const ts = ord.timestamp || ord.created_at || ord.date;
        const d = parseSafeDate(ts);
        if (d) {
          const orderDateStr = getMYDateStr(d);
          matchDate = orderDateStr === txFilterDate;
        }
      }

      return matchSearch && matchDate;
    });
  }, [paidOrders, txSearchQuery, txFilterDate]);

  // CSV LHDN Exporter
  const exportLHDNCSV = () => {
    const start = new Date(lhdnStartDate + 'T00:00:00');
    const end = new Date(lhdnEndDate + 'T23:59:59.999');

    const lhdnOrders = paidOrders.filter(ord => {
      const ts = ord.timestamp || ord.created_at || ord.date;
      const d = parseSafeDate(ts);
      if (!d) return false;
      return d >= start && d <= end;
    });

    if (lhdnOrders.length === 0) {
      alert(`Tiada rekod transaksi selesai dijumpai untuk julat tarikh ${lhdnStartDate} hingga ${lhdnEndDate}.`);
      return;
    }

    const headers = [
      'No. Resit / Invois Unik',
      'Kod MSIC LHDN',
      'Tarikh',
      'Masa',
      'Meja',
      'Pelanggan',
      'Jenis Pesanan',
      'Jumlah Item',
      'Subtotal (RM)',
      'SST (RM)',
      'Cas Servis (RM)',
      'Cas Bungkus (RM)',
      'Jumlah Keseluruhan (RM)',
      'Status Pematuhan MyInvois LHDN'
    ];

    const rows = lhdnOrders.map(ord => {
      const ts = ord.timestamp || ord.created_at || ord.date;
      const d = parseSafeDate(ts) || new Date();
      const dateStr = d.toLocaleDateString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' });
      const timeStr = d.toLocaleTimeString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' });

      const items = getSafeItems(ord).filter(i => !i.cancelled);
      const subtotal = roundMoney(items.reduce((sum, i) => sum + ((Number(i.price) || 0) * (Number(i.quantity) || 1)), 0));
      const isTakeaway = ord.order_type === 'TAKEAWAY';
      const totalItemsCount = items.reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);

      const calc = calculateReceiptTotals(subtotal, receiptSettings, {
        isTakeaway,
        itemCount: totalItemsCount,
        takeawayItemCount: isTakeaway ? totalItemsCount : 0,
        takeawaySubtotal: isTakeaway ? subtotal : 0
      });

      const safeCustName = String(ord.customer_name || 'Pelanggan').replace(/"/g, '""');

      return [
        `"${ord.order_id}"`,
        '"56101 (Perkhidmatan Restoran & Makanan)"',
        `"${dateStr}"`,
        `"${timeStr}"`,
        `"Meja ${ord.table_number || '-'}"`,
        `"${safeCustName}"`,
        `"${isTakeaway ? 'Bungkus' : 'Makan Di Sini'}"`,
        totalItemsCount,
        calc.subtotal.toFixed(2),
        calc.sstAmount.toFixed(2),
        calc.serviceChargeAmount.toFixed(2),
        calc.takeawayChargeFinal.toFixed(2),
        calc.grandTotal.toFixed(2),
        '"DIBAYAR & PATUH MYINVOIS LHDN"'
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Laporan_Kewangan_LHDN_${lhdnStartDate}_ke_${lhdnEndDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF / Printable LHDN Audit Statement Generator
  const printLHDNReport = () => {
    const start = new Date(lhdnStartDate + 'T00:00:00');
    const end = new Date(lhdnEndDate + 'T23:59:59.999');

    const lhdnOrders = paidOrders.filter(ord => {
      const ts = ord.timestamp || ord.created_at || ord.date;
      const d = parseSafeDate(ts);
      if (!d) return false;
      return d >= start && d <= end;
    });

    let totalSubtotal = 0;
    let totalSst = 0;
    let totalService = 0;
    let totalTakeaway = 0;
    let totalGrand = 0;

    lhdnOrders.forEach(ord => {
      const items = getSafeItems(ord).filter(i => !i.cancelled);
      const sub = roundMoney(items.reduce((sum, i) => sum + (i.price * i.quantity), 0));
      const isTakeaway = ord.order_type === 'TAKEAWAY';
      const totalItemsCount = items.reduce((sum, i) => sum + i.quantity, 0);

      const calc = calculateReceiptTotals(sub, receiptSettings, {
        isTakeaway,
        itemCount: totalItemsCount,
        takeawayItemCount: isTakeaway ? totalItemsCount : 0,
        takeawaySubtotal: isTakeaway ? sub : 0
      });

      totalSubtotal = roundMoney(totalSubtotal + sub);
      totalSst = roundMoney(totalSst + calc.sstAmount);
      totalService = roundMoney(totalService + calc.serviceChargeAmount);
      totalTakeaway = roundMoney(totalTakeaway + calc.takeawayChargeFinal);
      totalGrand = roundMoney(totalGrand + calc.grandTotal);
    });

    const printWin = window.open('', '_blank', 'width=900,height=800');
    if (!printWin) return alert('Sila benarkan pop-up window untuk mencetak laporan PDF LHDN.');

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Laporan Audit Kewangan & Cukai LHDN — Rasa Selera</title>
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 30px; color: #111; line-height: 1.5; font-size: 12px; }
          .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 15px; margin-bottom: 20px; }
          .header h1 { margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 1px; }
          .header p { margin: 3px 0; color: #444; font-size: 11px; }
          .meta-table { width: 100%; margin-bottom: 20px; border-collapse: collapse; }
          .meta-table td { padding: 6px; border: 1px solid #ddd; }
          .summary-box { background: #f9f9f9; border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-bottom: 25px; }
          .summary-grid { display: flex; justify-content: space-between; }
          .summary-item { text-align: center; }
          .summary-item span { display: block; font-size: 10px; color: #666; text-transform: uppercase; }
          .summary-item strong { font-size: 16px; color: #111; }
          table.data-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 11px; }
          table.data-table th { background: #222; color: #fff; text-align: left; padding: 8px; font-weight: bold; }
          table.data-table td { padding: 8px; border-bottom: 1px solid #eee; }
          table.data-table tr:nth-child(even) { background: #fcfcfc; }
          .total-row { font-weight: bold; background: #eee !important; border-top: 2px solid #222; }
          .footer-sign { display: flex; justify-content: space-between; margin-top: 50px; pt-30px; }
          .sign-box { width: 220px; text-align: center; border-top: 1px solid #444; padding-top: 5px; font-size: 11px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${receiptSettings.headerTitle || 'RESTORAN RASA SELERA'}</h1>
          <p>${receiptSettings.headerAddress || 'No. 18, Jalan Telawi 3, Bangsar, 59100 Kuala Lumpur'}</p>
          <p><strong>PENYATA PENYATAAN HASIL & AUDIT CUKAI LHDN (MALAYSIA)</strong></p>
        </div>

        <table class="meta-table">
          <tr>
            <td><strong>Julat Tarikh Audit:</strong> ${lhdnStartDate} hingga ${lhdnEndDate}</td>
            <td><strong>Tarikh Dijana:</strong> ${new Date().toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' })}</td>
          </tr>
          <tr>
            <td><strong>Jumlah Transaksi Selesai:</strong> ${lhdnOrders.length} Resit</td>
            <td><strong>Status Pematuhan LHDN:</strong> PATUH STANDARD E-INVOICE / SST AUDIT</td>
          </tr>
        </table>

        <div class="summary-box">
          <div class="summary-grid">
            <div class="summary-item">
              <span>Jualan Bersih (Subtotal)</span>
              <strong>RM ${totalSubtotal.toFixed(2)}</strong>
            </div>
            <div class="summary-item">
              <span>Cukai SST (${receiptSettings.sstRate || 0}%)</span>
              <strong>RM ${totalSst.toFixed(2)}</strong>
            </div>
            <div class="summary-item">
              <span>Cas Bungkus</span>
              <strong>RM ${totalTakeaway.toFixed(2)}</strong>
            </div>
            <div class="summary-item">
              <span>JUMLAH HASIL KASAR</span>
              <strong style="color: #059669;">RM ${totalGrand.toFixed(2)}</strong>
            </div>
          </div>
        </div>

        <h3 style="margin-bottom: 10px; font-size: 13px;">Jurnal Transaksi Lengkap</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>No. Resit</th>
              <th>Tarikh & Masa</th>
              <th>Meja / Pelanggan</th>
              <th>Jenis</th>
              <th style="text-align:right;">Subtotal</th>
              <th style="text-align:right;">Cas Bungkus</th>
              <th style="text-align:right;">Jumlah (RM)</th>
            </tr>
          </thead>
          <tbody>
            ${lhdnOrders.map(ord => {
              const ts = ord.timestamp || ord.created_at || ord.date;
              const d = parseSafeDate(ts) || new Date();
              const dateStr = d.toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'short', timeStyle: 'short' });
              const items = getSafeItems(ord).filter(i => !i.cancelled);
              const sub = roundMoney(items.reduce((sum, i) => sum + (i.price * i.quantity), 0));
              const isTakeaway = ord.order_type === 'TAKEAWAY';
              const totalItemsCount = items.reduce((sum, i) => sum + i.quantity, 0);
              const calc = calculateReceiptTotals(sub, receiptSettings, { isTakeaway, itemCount: totalItemsCount, takeawayItemCount: isTakeaway ? totalItemsCount : 0, takeawaySubtotal: isTakeaway ? sub : 0 });

              return `
                <tr>
                  <td><strong>${ord.order_id}</strong></td>
                  <td>${dateStr}</td>
                  <td>Meja ${ord.table_number || '-'} (${ord.customer_name || 'Pelanggan'})</td>
                  <td>${isTakeaway ? 'Bungkus 🛍️' : 'Dine-in 🍽️'}</td>
                  <td style="text-align:right;">RM ${sub.toFixed(2)}</td>
                  <td style="text-align:right;">RM ${calc.takeawayChargeFinal.toFixed(2)}</td>
                  <td style="text-align:right;"><strong>RM ${calc.grandTotal.toFixed(2)}</strong></td>
                </tr>
              `;
            }).join('')}
            <tr class="total-row">
              <td colspan="4">JUMLAH KESELURUHAN AUDIT (${lhdnOrders.length} REKOD)</td>
              <td style="text-align:right;">RM ${totalSubtotal.toFixed(2)}</td>
              <td style="text-align:right;">RM ${totalTakeaway.toFixed(2)}</td>
              <td style="text-align:right; font-size:13px; color:#059669;">RM ${totalGrand.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer-sign">
          <div class="sign-box">
            <p>Disediakan Oleh:<br/><br/><br/>_______________________<br/><strong>Pengurus Restoran / Juruwang</strong></p>
          </div>
          <div class="sign-box">
            <p>Disahkan Audit LHDN:<br/><br/><br/>_______________________<br/><strong>Pegawai Pemeriksa LHDN</strong></p>
          </div>
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  return (
    <section className="space-y-8 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* MODULE HEADER BANNER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold rounded-full uppercase flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> MODUL ANALITIK & REKOD KEWANGAAN
            </span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Prestasi Jualan & Laporan LHDN</h2>
          <p className="text-xs text-slate-400">Perekod automatik hasil jualan, populariti menu, dan penjana laporan audit cukai LHDN.</p>
        </div>

        {/* LHDN EXPORT BUTTONS (Touch Friendly min-h-[44px]) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportLHDNCSV}
            className="px-4 py-3 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs rounded-2xl border border-emerald-500/30 flex items-center gap-2 transition shadow-md cursor-pointer active:scale-95 touch-manipulation"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Muat Turun CSV (LHDN)</span>
          </button>
          
          <button
            onClick={printLHDNReport}
            className="px-4 py-3 min-h-[44px] bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-black text-xs rounded-2xl flex items-center gap-2 transition shadow-lg shadow-emerald-600/20 cursor-pointer active:scale-95 touch-manipulation"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Penyata LHDN (PDF)</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* REQUIREMENT 1: PEREKOD DUIT MASUK (OVERVIEW METRICS CARDS) */}
      {/* =================================================================== */}
      <ModuleErrorBoundary moduleName="Perekod Duit Masuk">
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" /> Ringkasan Perekod Duit Masuk
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 whitespace-nowrap">
              {currentTimeframe.label}
            </span>
          </div>

          {/* RESPONSIVE GRID: Desktop 4 Cols -> Tablet 2 Cols -> Mobile 1 Col */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Card 1: Total Revenue */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2 relative overflow-hidden group hover:border-emerald-500/40 transition">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-bold">Hasil Keseluruhan</span>
                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0"><DollarSign className="w-4 h-4" /></div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-white font-mono truncate tracking-tight">RM {financialMetrics.totalRevenue.toFixed(2)}</div>
              <p className="text-[10px] text-slate-500">Termasuk cukai, cas perkhidmatan & cas bungkus</p>
            </div>

            {/* Card 2: Net Sales */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2 relative overflow-hidden group hover:border-blue-500/40 transition">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-bold">Jualan Bersih (Subtotal)</span>
                <div className="h-8 w-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0"><ShoppingBag className="w-4 h-4" /></div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-blue-300 font-mono truncate tracking-tight">RM {financialMetrics.netSalesSubtotal.toFixed(2)}</div>
              <p className="text-[10px] text-slate-500">Nilai jualan makanan & minuman asal</p>
            </div>

            {/* Card 3: Takeaway Charge Collected */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2 relative overflow-hidden group hover:border-amber-500/40 transition">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-bold">Dikutip Cas Bungkus</span>
                <div className="h-8 w-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0"><Tag className="w-4 h-4" /></div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono truncate tracking-tight">RM {financialMetrics.totalTakeawayCharges.toFixed(2)}</div>
              <p className="text-[10px] text-slate-500">Hasil terkumpul daripada pesanan bungkus</p>
            </div>

            {/* Card 4: Total Orders & AOV */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2 relative overflow-hidden group hover:border-purple-500/40 transition">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-bold">Pesanan Selesai / AOV</span>
                <div className="h-8 w-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0"><CheckCircle2 className="w-4 h-4" /></div>
              </div>
              <div className="text-lg sm:text-xl font-black text-purple-300 font-mono truncate tracking-tight">
                {financialMetrics.totalOrdersCount} <span className="text-xs font-normal text-slate-400">resit</span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono truncate">Purata per resit: <strong className="text-white">RM {financialMetrics.aov.toFixed(2)}</strong></p>
            </div>
          </div>
        </div>
      </ModuleErrorBoundary>

      {/* =================================================================== */}
      {/* REQUIREMENT 2: GRAF BULAT POPULARITI MENU (SINGLE LINE SLIDER) */}
      {/* =================================================================== */}
      <ModuleErrorBoundary moduleName="Graf Populariti Menu">
        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-6">
          
          {/* RESPONSIVE HEADER WITH FLEX-WRAP FILTER BUTTONS */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-rose-500 shrink-0" />
              <h3 className="text-sm font-extrabold text-white">Graf Populariti Menu</h3>
            </div>

            {/* RESPONSIVE FLEX-WRAP BUTTONS (Harian/Mingguan/Bulanan/Tahunan) */}
            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto bg-slate-900 border border-slate-800 rounded-2xl p-1.5">
              {TIMEFRAMES.map((tf, i) => (
                <button
                  key={tf.id}
                  onClick={() => setTimeframeIdx(i)}
                  className={`flex-1 sm:flex-initial px-3 py-2 min-h-[44px] rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 touch-manipulation whitespace-nowrap text-center ${
                    timeframeIdx === i
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  {tf.label.split(' ')[0]} {tf.label.split(' ')[1]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            
            {/* DONUT CHART VISUAL (DYNAMIC RESPONSIVE HEIGHT - H-[260PX] ON MOBILE) */}
            <div className="flex flex-col items-center justify-center p-2 space-y-3 h-[260px] sm:h-[320px] w-full">
              <div className="relative w-44 h-44 sm:w-56 sm:h-56 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                  {(() => {
                    const items = itemPopularityStats.topSellers || [];
                    const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
                    if (totalQty <= 0) {
                      return <circle cx="50" cy="50" r="38" fill="transparent" stroke="#334155" strokeWidth="16" />;
                    }

                    const colors = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
                    let accumulatedPercent = 0;

                    return items.map((item, idx) => {
                      const qty = Number(item.quantity) || 0;
                      if (qty <= 0) return null;
                      const percent = qty / totalQty;
                      if (isNaN(percent) || percent <= 0) return null;
                      const strokeDasharray = `${(percent * 238.76).toFixed(2)} 238.76`;
                      const strokeDashoffset = (-accumulatedPercent * 238.76).toFixed(2);
                      accumulatedPercent += percent;

                      return (
                        <circle
                          key={idx}
                          cx="50"
                          cy="50"
                          r="38"
                          fill="transparent"
                          stroke={colors[idx % colors.length]}
                          strokeWidth="16"
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          className="transition-all duration-500 hover:opacity-80 cursor-pointer"
                        />
                      );
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-black text-white font-mono">
                    {(itemPopularityStats.topSellers || []).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)}
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Item Terjual</span>
                </div>
              </div>

              <p className="text-center text-xs text-slate-400 italic">
                *Tarik / Tekan butang panah ➔ di atas untuk bertukar julat masa.
              </p>
            </div>

            {/* TOP SELLERS & BOTTOM SELLERS LIST */}
            <div className="space-y-6">
              
              {/* Top 5 Menu Laris */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4" /> Top 5 Menu Paling Laris ({currentTimeframe.label.split(' ')[1]})
                </h4>
                {itemPopularityStats.topSellers.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">Tiada rekod pesanan untuk julat ini.</p>
                ) : (
                  <div className="space-y-2">
                    {itemPopularityStats.topSellers.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-900 border border-slate-800 p-3 rounded-2xl">
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${idx === 0 ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                            #{idx + 1}
                          </span>
                          <div>
                            <div className="font-bold text-xs text-white">{item.name}</div>
                            <div className="text-[10px] text-slate-400">{item.category}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-xs text-emerald-400">{item.quantity} pesanan</div>
                          <div className="font-mono text-[10px] text-slate-400">RM {roundMoney(item.revenue).toFixed(2)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom 5 Menu Less Popular */}
              {itemPopularityStats.bottomSellers.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ArrowDownRight className="w-4 h-4" /> Menu Kurang Laris (Perlu Promosi)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {itemPopularityStats.bottomSellers.slice(0, 4).map((item, idx) => (
                      <div key={idx} className="bg-slate-900/60 border border-slate-800/80 p-2.5 rounded-xl flex items-center justify-between text-xs">
                        <span className="text-slate-300 truncate max-w-[120px]">{item.name}</span>
                        <span className="font-mono text-amber-400 font-bold text-[11px]">{item.quantity} order</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>
      </ModuleErrorBoundary>

      {/* =================================================================== */}
      {/* REQUIREMENT: COMMENT / FEEDBACK PELANGGAN SECTION (MOVED ABOVE 0 ORDER) */}
      {/* =================================================================== */}
      <ModuleErrorBoundary moduleName="Comment / Feedback Pelanggan">
        <div className="bg-slate-950/80 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5">
          
          {/* Section Header & Metrics */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold rounded-full uppercase flex items-center gap-1.5">
                  💬 MAKLUM BALAS PELANGGAN
                </span>

                {/* Telegram Bot Integration Header Button */}
                <button
                  onClick={() => setIsTelegramModalOpen(true)}
                  className="px-3 py-1 bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-300 font-bold text-xs rounded-full transition flex items-center gap-1.5 cursor-pointer active:scale-95 touch-manipulation whitespace-nowrap min-h-[32px]"
                  title="Tetapan Notifikasi Telegram Bot"
                >
                  <Send className="w-3.5 h-3.5 text-sky-400" />
                  <span>📱 Tetapan Telegram Bot</span>
                  {receiptSettings?.telegramEnabled && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                  )}
                </button>
              </div>
              <h3 className="text-xl font-black text-white tracking-tight">Comment / Feedback Pelanggan</h3>
              <p className="text-xs text-slate-400">Senarai ulasan, rating 👍/👎 dan maklum balas hidangan daripada pelanggan.</p>
            </div>

            {/* Feedback Stats Counters */}
            {(() => {
              const totalFb = (feedbacks || []).length;
              const goodFb = (feedbacks || []).filter(f => f.rating === 'GOOD').length;
              const badFb = (feedbacks || []).filter(f => f.rating === 'BAD').length;
              const goodPercent = totalFb > 0 ? Math.round((goodFb / totalFb) * 100) : 0;

              return (
                <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
                  <div className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-2xl text-center">
                    <div className="text-[10px] text-slate-500 font-sans">Jumlah Feedback</div>
                    <div className="text-base font-black text-white">{totalFb}</div>
                  </div>

                  <div className="px-3 py-2 bg-emerald-950/60 border border-emerald-500/30 rounded-2xl text-center">
                    <div className="text-[10px] text-emerald-400 font-sans">👍 Puas Hati ({goodPercent}%)</div>
                    <div className="text-base font-black text-emerald-400">{goodFb}</div>
                  </div>

                  <div className="px-3 py-2 bg-rose-950/60 border border-rose-500/30 rounded-2xl text-center">
                    <div className="text-[10px] text-rose-400 font-sans">👎 Kurang Puas</div>
                    <div className="text-base font-black text-rose-400">{badFb}</div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Feedback Cards List (Initial 4 Most Recent Feedbacks) */}
          {(!feedbacks || feedbacks.length === 0) ? (
            <div className="text-center text-slate-500 text-xs py-10 bg-slate-900/50 rounded-2xl border border-slate-800/80 space-y-2">
              <div className="text-2xl">💬</div>
              <p className="font-bold text-slate-400">Belum Ada Feedback Pelanggan</p>
              <p className="text-[11px] text-slate-600">Maklum balas yang dihantar oleh pelanggan selepas bayaran akan dipaparkan di sini secara automatik.</p>
            </div>
          ) : (
            <div className="space-y-4 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {(feedbacks || []).slice(0, 4).map((fb, idx) => {
                  const isGood = fb?.rating === 'GOOD';
                  const dateObj = parseSafeDate(fb?.created_at);
                  const timeStr = dateObj ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  const dateStr = dateObj ? getMYDateStr(dateObj) : '';
                  const itemsList = Array.isArray(fb?.commented_items) ? fb.commented_items : [];

                  return (
                    <div
                      key={fb?.feedback_id || idx}
                      className={`w-full rounded-2xl p-4 space-y-3 border transition text-left relative overflow-hidden ${
                        isGood
                          ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50'
                          : 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50'
                      }`}
                    >
                      {/* Header Row: Order ID, Table No, Rating Badge */}
                      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-black text-xs text-white">
                              {fb?.order_id || 'N/A'}
                            </span>
                            {fb?.table_number && (
                              <span className="bg-slate-800 text-amber-300 border border-slate-700 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                                MEJA {fb.table_number}
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400 font-bold">
                              • {fb?.customer_name || 'Pelanggan'}
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {dateStr} {timeStr}
                          </div>
                        </div>

                        {/* Rating Badge */}
                        <span className={`px-2.5 py-1 rounded-full text-xs font-black font-mono flex items-center gap-1 shrink-0 whitespace-nowrap ${
                          isGood
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-xs'
                        }`}>
                          <span>{isGood ? '👍 PUAS HATI' : '👎 KURANG PUAS'}</span>
                        </span>
                      </div>

                      {/* Flagged Items Tag List (Responsive Wrap) */}
                      {itemsList.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                            Hidangan Ditandakan:
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {itemsList.map((itemName, i) => (
                              <span
                                key={i}
                                className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-slate-200 text-[11px] font-medium rounded-lg break-words max-w-full"
                              >
                                🍲 {itemName}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Comment Quote Box */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                          Komen Pelanggan:
                        </span>
                        <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed font-sans italic break-words">
                          {fb?.comment ? `"${fb.comment.slice(0, 300)}"` : <span className="text-slate-500 font-mono text-[11px] not-italic">(Tiada ulasan bertulis)</span>}
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* Load More Button for Feedback (Opens Popup Modal) */}
              {(feedbacks || []).length > 4 && (
                <div className="text-center pt-3 border-t border-slate-800/80">
                  <button
                    onClick={() => {
                      setFeedbackModalPage(1);
                      setIsFeedbackModalOpen(true);
                    }}
                    className="px-6 py-3 min-h-[44px] bg-slate-900 hover:bg-slate-800 border border-amber-500/30 hover:border-amber-500/60 text-amber-400 font-mono font-bold text-xs rounded-2xl transition cursor-pointer active:scale-95 touch-manipulation shadow-md inline-flex items-center gap-2"
                  >
                    <span>💬 Paparkan Semua Feedback ({feedbacks.length} Rekod)</span>
                    <span>→</span>
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </ModuleErrorBoundary>

      {/* =================================================================== */}
      {/* REQUIREMENT 3: SENARAI MENU TIADA ORDER LANGSUNG (0 ORDER) */}
      {/* =================================================================== */}
      <ModuleErrorBoundary moduleName="Senarai Menu 0 Order">
        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500" /> Senarai Menu 0 Order (Tiada Pesanan Langsung)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Kenal pasti hidangan yang belum dibeli oleh mana-mana pelanggan.</p>
            </div>

            {/* Zero Order Range Tabs (Touch Friendly min-h-[44px]) */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-2xl shrink-0 overflow-x-auto scrollbar-thin">
              <button
                onClick={() => setZeroOrderFilter('DAILY')}
                className={`px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 touch-manipulation whitespace-nowrap ${zeroOrderFilter === 'DAILY' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                Harian
              </button>
              <button
                onClick={() => setZeroOrderFilter('WEEKLY')}
                className={`px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 touch-manipulation whitespace-nowrap ${zeroOrderFilter === 'WEEKLY' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                Mingguan
              </button>
              <button
                onClick={() => setZeroOrderFilter('MONTHLY')}
                className={`px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 touch-manipulation whitespace-nowrap ${zeroOrderFilter === 'MONTHLY' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                Bulanan
              </button>
            </div>
          </div>

          {zeroOrderItems.length === 0 ? (
            <div className="text-center py-8 bg-slate-900/40 border border-slate-800/80 rounded-2xl text-emerald-400 font-bold text-xs space-y-1">
              <p>🎉 Tahniah! Semua menu restoran anda menerima pesanan dalam julat {zeroOrderFilter.toLowerCase()} ini!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {zeroOrderItems.map(item => (
                <div key={item.id || item.name} className="bg-slate-900 border border-rose-500/20 hover:border-rose-500/40 rounded-2xl p-3.5 space-y-2 transition">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-xs text-white leading-tight">{item.name}</h4>
                      <span className="text-[10px] text-slate-400 font-mono">{item.category}</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-rose-400 whitespace-nowrap">RM {Number(item.price).toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px]">
                    <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-full font-bold whitespace-nowrap">
                      🔴 0 Order ({zeroOrderFilter})
                    </span>
                    <a href="/menu-editor" className="text-slate-400 hover:text-white underline whitespace-nowrap">Edit Menu →</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ModuleErrorBoundary>

      {/* =================================================================== */}
      {/* REQUIREMENT 4: LIST KAD ORDER SELESAI BAYAR (PAID TRANSACTIONS) */}
      {/* =================================================================== */}
      <ModuleErrorBoundary moduleName="Jurnal Transaksi Selesai">
        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Senarai Rekod Transaksi Selesai Bayar ({filteredPaidTransactions.length})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Jurnal lengkap semua transaksi pelanggan yang telah dijelaskan bayarannya.</p>
            </div>

            {/* Search & Date Filter Bar (Touch Friendly min-h-[44px]) */}
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3.5 pointer-events-none" />
                <input
                  type="text"
                  value={txSearchQuery}
                  onChange={(e) => setTxSearchQuery(e.target.value)}
                  placeholder="Cari Resit #ORD / Meja / Nama..."
                  className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2.5 min-h-[44px] outline-none focus:border-emerald-500 transition placeholder-slate-600"
                />
              </div>

              <input
                type="date"
                value={txFilterDate}
                onChange={(e) => setTxFilterDate(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2.5 min-h-[44px] outline-none focus:border-emerald-500 transition font-mono shrink-0"
              />

              {txFilterDate && (
                <button onClick={() => setTxFilterDate('')} className="text-xs text-rose-400 font-bold px-3 py-2.5 min-h-[44px] active:scale-95 touch-manipulation shrink-0">Padam Tarikh</button>
              )}
            </div>
          </div>

          {filteredPaidTransactions.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
              Tiada rekod transaksi selesai bayar yang ditemui.
            </div>
          ) : (
            <div className="space-y-4 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredPaidTransactions.slice(0, 4).map(ord => {
                  const ts = ord.timestamp || ord.created_at || ord.date;
                  const d = parseSafeDate(ts) || new Date();
                  const dateStr = d.toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' });

                  const items = getSafeItems(ord).filter(i => !i.cancelled);
                  const subtotal = roundMoney(items.reduce((sum, i) => sum + (i.price * i.quantity), 0));
                  const isTakeaway = ord.order_type === 'TAKEAWAY';
                  const totalItemsCount = items.reduce((sum, i) => sum + i.quantity, 0);

                  const calc = calculateReceiptTotals(subtotal, receiptSettings, {
                    isTakeaway,
                    itemCount: totalItemsCount,
                    takeawayItemCount: isTakeaway ? totalItemsCount : 0,
                    takeawaySubtotal: isTakeaway ? subtotal : 0
                  });

                  const isExpanded = expandedTxIds.has(ord.order_id);

                  return (
                    <div
                      key={ord.order_id}
                      onClick={() => toggleTxExpand(ord.order_id)}
                      className="bg-slate-900 border border-slate-800 hover:border-emerald-500/30 rounded-2xl p-3.5 sm:p-4 space-y-2.5 transition cursor-pointer shadow-xs select-none group touch-manipulation"
                    >
                      {/* BARIS 1: ORD-1001 | PAID ✅ | Meja 5 • Pelanggan: Rewt | 3 Ogo 2026, 3:40 PG | 🛍️ BUNGKUS / DINE IN */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-black text-rose-400 text-sm tracking-tight whitespace-nowrap">{ord.order_id}</span>
                          <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10.5px] font-mono font-bold rounded-md flex items-center gap-1 whitespace-nowrap">
                            PAID ✅
                          </span>
                          <span className="text-slate-300 font-semibold text-[11px]">
                            Meja {ord.table_number || '-'} • Pelanggan: <strong className="text-white">{ord.customer_name || 'Pelanggan'}</strong>
                          </span>
                        </div>

                        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400 ml-auto sm:ml-0 whitespace-nowrap">
                          <span className="text-slate-400 text-[10.5px]">{dateStr}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${isTakeaway ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'}`}>
                            {isTakeaway ? '🛍️ BUNGKUS' : '🍽️ DINE IN'}
                          </span>
                        </div>
                      </div>

                      {/* BARIS 2: JUMLAH DIBAYAR: RM XX.XX + IKON DROPDOWN ARROW (▼) */}
                      <div className="flex justify-between items-center pt-0.5">
                        <div className="font-mono text-xs text-slate-400 font-bold flex items-center gap-2">
                          <span className="text-slate-400">JUMLAH DIBAYAR:</span>
                          <span className="text-emerald-400 font-black text-base whitespace-nowrap">RM {calc.grandTotal.toFixed(2)}</span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono group-hover:text-emerald-400 transition">
                          <span className="text-[10px] text-slate-500 hidden sm:inline">{isExpanded ? 'Sembunyi' : 'Lihat Butiran'}</span>
                          <ChevronDown className={`w-4 h-4 text-emerald-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : 'rotate-0'}`} />
                        </div>
                      </div>

                      {/* ACCORDION SLIDE-DOWN DETAILS PANEL WITH OVERFLOW SCROLL */}
                      <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-3 pt-3 border-t border-slate-800' : 'grid-rows-[0fr] opacity-0 overflow-hidden'}`}>
                        <div className="overflow-hidden space-y-3">
                          
                          {/* Items List (Overflow-X Auto for long options) */}
                          <div className="space-y-1.5 font-mono text-xs bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 overflow-x-auto scrollbar-thin">
                            <div className="text-[10px] text-slate-500 font-sans font-bold uppercase tracking-wider mb-1">Butiran Pesanan ({items.length} item):</div>
                            {items.map((it, idx) => (
                              <div key={idx} className="flex justify-between text-slate-200 min-w-[240px]">
                                <span>{it.quantity}x {it.name} {it.options ? <span className="text-slate-400 italic">({it.options})</span> : ''}</span>
                                <span className="font-bold text-emerald-400/90 whitespace-nowrap ml-2">RM {(it.price * it.quantity).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>

                          {/* Breakdown & Grand Total Summary */}
                          <div className="space-y-1 font-mono text-xs text-slate-400 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                            <div className="flex justify-between">
                              <span>Subtotal:</span>
                              <span className="whitespace-nowrap">RM {calc.subtotal.toFixed(2)}</span>
                            </div>
                            {calc.enableSst && (
                              <div className="flex justify-between">
                                <span>SST ({calc.sstRate}%):</span>
                                <span className="whitespace-nowrap">RM {calc.sstAmount.toFixed(2)}</span>
                              </div>
                            )}
                            {calc.enableTakeawayCharge && isTakeaway && calc.takeawayChargeFinal > 0 && (
                              <div className="flex justify-between text-amber-400">
                                <span>Cas Bungkus:</span>
                                <span className="whitespace-nowrap">RM {calc.takeawayChargeFinal.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-bold text-white pt-1.5 border-t border-slate-800">
                              <span>JUMLAH DIBAYAR:</span>
                              <span className="text-emerald-400 font-extrabold text-sm whitespace-nowrap">RM {calc.grandTotal.toFixed(2)}</span>
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load More Button for Paid Transactions (Opens Popup Modal) */}
              {filteredPaidTransactions.length > 4 && (
                <div className="text-center pt-3 border-t border-slate-800/80">
                  <button
                    onClick={() => {
                      setTxModalPage(1);
                      setIsTxModalOpen(true);
                    }}
                    className="px-6 py-3 min-h-[44px] bg-slate-900 hover:bg-slate-800 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 font-mono font-bold text-xs rounded-2xl transition cursor-pointer active:scale-95 touch-manipulation shadow-md inline-flex items-center gap-2"
                  >
                    <span>📜 Paparkan Semua Transaksi Selesai ({filteredPaidTransactions.length} Rekod)</span>
                    <span>→</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </ModuleErrorBoundary>

      {/* =================================================================== */}
      {/* REQUIREMENT 5: MUAT TURUN LAPORAN LHDN (DATE SELECTOR CONTROLS) */}
      {/* =================================================================== */}
      <ModuleErrorBoundary moduleName="Eksport Laporan LHDN">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Tetapan Julat Tarikh Audit LHDN
              </h3>
              <p className="text-xs text-slate-400">Pilih julat tarikh transaksi untuk dijana ke dalam format CSV / PDF Audit LHDN.</p>
            </div>

            {/* Date Selector Inputs (Touch-Friendly min-h-[44px]) */}
            <div className="flex items-center gap-2 flex-wrap font-mono text-xs w-full sm:w-auto">
              <div className="flex-1 sm:flex-initial">
                <label className="text-[10px] text-slate-500 block mb-1">Tarikh Mula:</label>
                <input
                  type="date"
                  value={lhdnStartDate}
                  onChange={(e) => setLhdnStartDate(e.target.value)}
                  className="w-full sm:w-auto bg-slate-900 border border-slate-800 text-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex-1 sm:flex-initial">
                <label className="text-[10px] text-slate-500 block mb-1">Tarikh Akhir:</label>
                <input
                  type="date"
                  value={lhdnEndDate}
                  onChange={(e) => setLhdnEndDate(e.target.value)}
                  className="w-full sm:w-auto bg-slate-900 border border-slate-800 text-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>
      </ModuleErrorBoundary>

      {/* =================================================================== */}
      {/* TELEGRAM BOT CONFIGURATION MODAL POPUP (WITH SCROLL LOCK) */}
      {/* =================================================================== */}
      {isTelegramModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-5 text-left text-slate-100 shadow-2xl relative max-h-[90vh] overflow-y-auto scrollbar-thin animate-scaleUp">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-500/40 text-sky-400 flex items-center justify-center font-bold">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white leading-tight">Integrasi Telegram Bot</h3>
                  <p className="text-[11px] text-slate-400">Notifikasi maklum balas pelanggan secara langsung.</p>
                </div>
              </div>

              <button
                onClick={() => setIsTelegramModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Toggle Switch Box */}
            <div className="flex items-center justify-between p-4 bg-slate-950/80 border border-slate-800 rounded-2xl">
              <div className="space-y-0.5 pr-2">
                <span className="font-bold text-xs text-white block">Status Notifikasi Telegram</span>
                <span className="text-[11px] text-slate-400 block leading-tight">Hantar maklum balas terus ke Telegram apabila pelanggan hantar feedback.</span>
              </div>

              <button
                type="button"
                onClick={() => setTelegramEnabled(!telegramEnabled)}
                className={`w-14 h-8 flex items-center rounded-full p-1 transition-colors duration-300 cursor-pointer shrink-0 ${
                  telegramEnabled ? 'bg-emerald-600 justify-end' : 'bg-slate-800 justify-start border border-slate-700'
                }`}
              >
                <span className="w-6 h-6 rounded-full bg-white shadow-md transform transition-transform" />
              </button>
            </div>

            {/* Bot Token Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300">Bot Token Telegram:</label>
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10.5px] text-sky-400 hover:underline flex items-center gap-1 font-mono"
                >
                  Dapatkan @BotFather ↗
                </a>
              </div>
              <input
                type="text"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                placeholder="cth: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-xs font-mono text-slate-200 outline-none focus:border-sky-500 transition placeholder-slate-600 min-h-[44px]"
              />
              <p className="text-[10.5px] text-slate-500 leading-normal">
                Dapatkan Token ini dengan membuat bot baharu via <strong>@BotFather</strong> di aplikasi Telegram.
              </p>
            </div>

            {/* Chat ID Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block">
                Chat ID / Channel ID Telegram:
              </label>
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="cth: -100123456789 atau 987654321 atau @mychannel"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3 text-xs font-mono text-slate-200 outline-none focus:border-sky-500 transition placeholder-slate-600 min-h-[44px]"
              />
              <p className="text-[10.5px] text-slate-500 leading-normal">
                Boleh gunakan ID akaun peribadi, ID Group (cth: <code>-100...</code>), atau username Channel awam.
              </p>
            </div>

            {/* Status Feedback Banner */}
            {telegramStatusMsg && (
              <div className={`p-3.5 rounded-xl text-xs font-medium border leading-relaxed animate-fadeIn ${
                telegramStatusMsg.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/80 border-rose-500/40 text-rose-300'
              }`}>
                {telegramStatusMsg.text}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleTestTelegram}
                disabled={isTestingTelegram || !telegramBotToken.trim() || !telegramChatId.trim()}
                className="flex-1 py-3 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-400 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                <Send className="w-4 h-4" />
                <span>{isTestingTelegram ? 'Menguji...' : 'Uji Sambungan'}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveTelegram}
                disabled={isSavingTelegram}
                className="flex-1 py-3 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-md shadow-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSavingTelegram ? 'Menyimpan...' : 'Simpan Tetapan'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* POPUP MODAL 1: JURNAL PENUH FEEDBACK PELANGGAN (15 REKOD / PAGE) */}
      {/* =================================================================== */}
      {isFeedbackModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-5 sm:p-6 space-y-5 text-left text-slate-100 shadow-2xl relative max-h-[92vh] flex flex-col animate-scaleUp">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-bold">
                  💬
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white leading-tight">
                    Jurnal Penuh Feedback Pelanggan
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Menunjukkan {Math.min(15, feedbacks.length)} daripada {feedbacks.length} rekod maklum balas.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsFeedbackModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content List (15 Records Per Page, Scrollable Body) */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 scrollbar-thin">
              {feedbacks.length === 0 ? (
                <p className="text-center text-slate-500 text-xs py-10">Tiada feedback pelanggan.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {feedbacks.slice((feedbackModalPage - 1) * 15, feedbackModalPage * 15).map((fb, idx) => {
                    const isGood = fb?.rating === 'GOOD';
                    const dateObj = parseSafeDate(fb?.created_at);
                    const timeStr = dateObj ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    const dateStr = dateObj ? getMYDateStr(dateObj) : '';
                    const itemsList = Array.isArray(fb?.commented_items) ? fb.commented_items : [];

                    return (
                      <div
                        key={fb?.feedback_id || idx}
                        className={`w-full rounded-2xl p-4 space-y-3 border transition text-left relative overflow-hidden ${
                          isGood
                            ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50'
                            : 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50'
                        }`}
                      >
                        {/* Header Row: Order ID, Table No, Rating Badge */}
                        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-black text-xs text-white">
                                {fb?.order_id || 'N/A'}
                              </span>
                              {fb?.table_number && (
                                <span className="bg-slate-800 text-amber-300 border border-slate-700 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                                  MEJA {fb.table_number}
                                </span>
                              )}
                              <span className="text-[11px] text-slate-400 font-bold">
                                • {fb?.customer_name || 'Pelanggan'}
                              </span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-500">
                              {dateStr} {timeStr}
                            </div>
                          </div>

                          <span className={`px-2.5 py-1 rounded-full text-xs font-black font-mono flex items-center gap-1 shrink-0 whitespace-nowrap ${
                            isGood
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-xs'
                          }`}>
                            <span>{isGood ? '👍 PUAS HATI' : '👎 KURANG PUAS'}</span>
                          </span>
                        </div>

                        {/* Flagged Items */}
                        {itemsList.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                              Hidangan Ditandakan:
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {itemsList.map((itemName, i) => (
                                <span
                                  key={i}
                                  className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-slate-200 text-[11px] font-medium rounded-lg break-words max-w-full"
                                >
                                  🍲 {itemName}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Comment Quote */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                            Komen Pelanggan:
                          </span>
                          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed font-sans italic break-words">
                            {fb?.comment ? `"${fb.comment.slice(0, 300)}"` : <span className="text-slate-500 font-mono text-[11px] not-italic">(Tiada ulasan bertulis)</span>}
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Mini Pagination Controls (15 Records / Page) */}
            <div className="flex items-center justify-between pt-3.5 border-t border-slate-800 text-xs font-mono shrink-0">
              <button
                disabled={feedbackModalPage === 1}
                onClick={() => setFeedbackModalPage(prev => Math.max(prev - 1, 1))}
                className="px-4 py-2.5 min-h-[44px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl font-bold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95 touch-manipulation flex items-center gap-1"
              >
                <span>← Sebelum</span>
              </button>

              <span className="text-slate-400 font-bold">
                Halaman <strong className="text-amber-400 text-sm">{feedbackModalPage}</strong> daripada <strong>{Math.ceil(feedbacks.length / 15) || 1}</strong>
              </span>

              <button
                disabled={feedbackModalPage >= Math.ceil(feedbacks.length / 15)}
                onClick={() => setFeedbackModalPage(prev => prev + 1)}
                className="px-4 py-2.5 min-h-[44px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl font-bold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95 touch-manipulation flex items-center gap-1"
              >
                <span>Seterusnya →</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* POPUP MODAL 2: SENARAI REKOD TRANSAKSI SELESAI BAYAR (15 REKOD / PAGE) */}
      {/* =================================================================== */}
      {isTxModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-5 sm:p-6 space-y-4 text-left text-slate-100 shadow-2xl relative max-h-[92vh] flex flex-col animate-scaleUp">
            
            {/* Modal Header & Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold">
                  📜
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white leading-tight">
                    Senarai Transaksi Selesai Bayar
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {filteredPaidTransactions.length} rekod dijumpai • 15 rekod / halaman.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 sm:w-56 min-w-[160px]">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={txSearchQuery}
                    onChange={(e) => {
                      setTxSearchQuery(e.target.value);
                      setTxModalPage(1);
                    }}
                    placeholder="Cari Resit #ORD..."
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2 min-h-[40px] outline-none focus:border-emerald-500 transition placeholder-slate-600"
                  />
                </div>

                <button
                  onClick={() => setIsTxModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-700 cursor-pointer ml-auto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body List (15 Records / Page) */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 scrollbar-thin">
              {filteredPaidTransactions.length === 0 ? (
                <p className="text-center text-slate-500 text-xs py-10">Tiada rekod transaksi dijumpai.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredPaidTransactions.slice((txModalPage - 1) * 15, txModalPage * 15).map(ord => {
                    const ts = ord.timestamp || ord.created_at || ord.date;
                    const d = parseSafeDate(ts) || new Date();
                    const dateStr = d.toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' });

                    const items = getSafeItems(ord).filter(i => !i.cancelled);
                    const subtotal = roundMoney(items.reduce((sum, i) => sum + (i.price * i.quantity), 0));
                    const isTakeaway = ord.order_type === 'TAKEAWAY';
                    const totalItemsCount = items.reduce((sum, i) => sum + i.quantity, 0);

                    const calc = calculateReceiptTotals(subtotal, receiptSettings, {
                      isTakeaway,
                      itemCount: totalItemsCount,
                      takeawayItemCount: isTakeaway ? totalItemsCount : 0,
                      takeawaySubtotal: isTakeaway ? subtotal : 0
                    });

                    const isExpanded = expandedTxIds.has(ord.order_id);

                    return (
                      <div
                        key={ord.order_id}
                        onClick={() => toggleTxExpand(ord.order_id)}
                        className="bg-slate-950 border border-slate-800 hover:border-emerald-500/30 rounded-2xl p-3.5 space-y-2.5 transition cursor-pointer shadow-xs select-none group touch-manipulation text-left"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-800/80 pb-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-black text-rose-400 text-sm tracking-tight whitespace-nowrap">{ord.order_id}</span>
                            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10.5px] font-mono font-bold rounded-md flex items-center gap-1 whitespace-nowrap">
                              PAID ✅
                            </span>
                            <span className="text-slate-300 font-semibold text-[11px]">
                              Meja {ord.table_number || '-'} • Pelanggan: <strong className="text-white">{ord.customer_name || 'Pelanggan'}</strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400 ml-auto sm:ml-0 whitespace-nowrap">
                            <span className="text-slate-400 text-[10.5px]">{dateStr}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${isTakeaway ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'}`}>
                              {isTakeaway ? '🛍️ BUNGKUS' : '🍽️ DINE IN'}
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-0.5">
                          <div className="font-mono text-xs text-slate-400 font-bold flex items-center gap-2">
                            <span className="text-slate-400">JUMLAH DIBAYAR:</span>
                            <span className="text-emerald-400 font-black text-base whitespace-nowrap">RM {calc.grandTotal.toFixed(2)}</span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono group-hover:text-emerald-400 transition">
                            <span className="text-[10px] text-slate-500 hidden sm:inline">{isExpanded ? 'Sembunyi' : 'Lihat Butiran'}</span>
                            <ChevronDown className={`w-4 h-4 text-emerald-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : 'rotate-0'}`} />
                          </div>
                        </div>

                        <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-3 pt-3 border-t border-slate-800' : 'grid-rows-[0fr] opacity-0 overflow-hidden'}`}>
                          <div className="overflow-hidden space-y-3">
                            <div className="space-y-1.5 font-mono text-xs bg-slate-900 p-3 rounded-xl border border-slate-800/80 overflow-x-auto scrollbar-thin">
                              <div className="text-[10px] text-slate-500 font-sans font-bold uppercase tracking-wider mb-1">Butiran Pesanan ({items.length} item):</div>
                              {items.map((it, idx) => (
                                <div key={idx} className="flex justify-between text-slate-200 min-w-[240px]">
                                  <span>{it.quantity}x {it.name} {it.options ? <span className="text-slate-400 italic">({it.options})</span> : ''}</span>
                                  <span className="font-bold text-emerald-400/90 whitespace-nowrap ml-2">RM {(it.price * it.quantity).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>

                            <div className="space-y-1 font-mono text-xs text-slate-400 bg-slate-900/60 p-3 rounded-xl border border-slate-800/60">
                              <div className="flex justify-between">
                                <span>Subtotal:</span>
                                <span className="whitespace-nowrap">RM {calc.subtotal.toFixed(2)}</span>
                              </div>
                              {calc.enableSst && (
                                <div className="flex justify-between">
                                  <span>SST ({calc.sstRate}%):</span>
                                  <span className="whitespace-nowrap">RM {calc.sstAmount.toFixed(2)}</span>
                                </div>
                              )}
                              {calc.enableTakeawayCharge && isTakeaway && calc.takeawayChargeFinal > 0 && (
                                <div className="flex justify-between text-amber-400">
                                  <span>Cas Bungkus:</span>
                                  <span className="whitespace-nowrap">RM {calc.takeawayChargeFinal.toFixed(2)}</span>
                                </div>
                              )}
                              <div className="flex justify-between font-bold text-white pt-1.5 border-t border-slate-800">
                                <span>JUMLAH DIBAYAR:</span>
                                <span className="text-emerald-400 font-extrabold text-sm whitespace-nowrap">RM {calc.grandTotal.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Mini Pagination Controls (15 Records / Page) */}
            <div className="flex items-center justify-between pt-3.5 border-t border-slate-800 text-xs font-mono shrink-0">
              <button
                disabled={txModalPage === 1}
                onClick={() => setTxModalPage(prev => Math.max(prev - 1, 1))}
                className="px-4 py-2.5 min-h-[44px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl font-bold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95 touch-manipulation flex items-center gap-1"
              >
                <span>← Sebelum</span>
              </button>

              <span className="text-slate-400 font-bold">
                Halaman <strong className="text-emerald-400 text-sm">{txModalPage}</strong> daripada <strong>{Math.ceil(filteredPaidTransactions.length / 15) || 1}</strong>
              </span>

              <button
                disabled={txModalPage >= Math.ceil(filteredPaidTransactions.length / 15)}
                onClick={() => setTxModalPage(prev => prev + 1)}
                className="px-4 py-2.5 min-h-[44px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl font-bold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95 touch-manipulation flex items-center gap-1"
              >
                <span>Seterusnya →</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </section>
  );
}
