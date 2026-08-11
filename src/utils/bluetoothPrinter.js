/**
 * Web Bluetooth ESC/POS Receipt Printer Service
 * Supports multiple thermal paper widths: 58mm (32 cols), 72mm (42 cols), 80mm (48 cols).
 * Supports dynamic logo raster generation scaled auto to selected paper width.
 */
import { calculateReceiptTotals } from './receiptCalculator';
import { getBackendBaseUrl } from './apiConfig';

// Common GATT Service UUIDs used by Bluetooth ESC/POS Thermal Printers
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer Service
  '0000e0ff-0000-1000-8000-00805f9b34fb', // Common Portable Thermal Printers
  '49535343-fe7d-41a3-8c56-79b64cc86123', // ISSC Transparent Service
  '00001101-0000-1000-8000-00805f9b34fb'  // SPP Serial Port Profile
];

/**
 * Sanitize text for thermal receipt printers (ESC/POS).
 * Removes or converts multi-byte Unicode Emojis and unprintable characters to clean ASCII
 * to prevent corrupted/gibberish character printing.
 */
function sanitizeForThermalPrint(text) {
  if (!text) return '';

  return String(text)
    // Map common emoji symbols to clean ASCII equivalents
    .replace(/🛍️|🛍/g, '[BUNGKUS]')
    .replace(/👤/g, '')
    .replace(/🍽️|🍽/g, '[DINE-IN]')
    .replace(/🖨️|🖨/g, '')
    .replace(/🌶️|🌶/g, '(PEDAS)')
    .replace(/⚡/g, '*')
    .replace(/⚠️/g, '[!]')
    .replace(/❌/g, '[X]')
    .replace(/✅/g, '[OK]')
    .replace(/👨‍🍳/g, '[DAPUR]')
    // Strip any remaining multi-byte Unicode emojis
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F1E6}-\u{1F1FF}]/gu, '')
    // Replace non-ASCII bytes above 0x7F that cause garbled text on ESC/POS CP437
    .replace(/[^\x00-\x7F]/g, '')
    .trim();
}

// Helper to safely parse items JSON array or array
function getSafeItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try { return JSON.parse(items); } catch(e) { return []; }
  }
  return [];
}

// Helper to convert string to Uint8Array (Clean ASCII/UTF-8 bytes)
function textToBytes(text) {
  // Preserve newline formatting while sanitizing text content
  const lines = String(text).split('\n');
  const cleanLines = lines.map(line => sanitizeForThermalPrint(line));
  const cleanText = cleanLines.join('\n');
  const encoder = new TextEncoder();
  return encoder.encode(cleanText);
}

// Helper to wrap text into multiple lines of a maximum character width
function wrapText(text, maxChars) {
  if (!text) return [];
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    if ((currentLine ? currentLine + ' ' + word : word).length <= maxChars) {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    } else {
      if (currentLine) lines.push(currentLine);
      let remainingWord = word;
      while (remainingWord.length > maxChars) {
        lines.push(remainingWord.substring(0, maxChars));
        remainingWord = remainingWord.substring(maxChars);
      }
      currentLine = remainingWord;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines;
}

// ESC/POS Command Byte Sequences
const ESC_POS = {
  INIT: new Uint8Array([0x1b, 0x40]),               // Initialize printer
  ALIGN_LEFT: new Uint8Array([0x1b, 0x61, 0x00]),   // Align Left
  ALIGN_CENTER: new Uint8Array([0x1b, 0x61, 0x01]), // Align Center
  ALIGN_RIGHT: new Uint8Array([0x1b, 0x61, 0x02]),  // Align Right
  BOLD_ON: new Uint8Array([0x1b, 0x45, 0x01]),      // Bold Text ON
  BOLD_OFF: new Uint8Array([0x1b, 0x45, 0x00]),     // Bold Text OFF
  DOUBLE_HEIGHT: new Uint8Array([0x1d, 0x21, 0x01]),// Double Height Text
  NORMAL_TEXT: new Uint8Array([0x1d, 0x21, 0x00]),  // Normal Text
  FEED_LINE: new Uint8Array([0x0a]),                // Line Feed
  CUT_PAPER: new Uint8Array([0x1d, 0x56, 0x41, 0x00])// Full Paper Cut
};

/**
 * Convert Image DataURL (Base64) to ESC/POS GS v 0 Raster Bitmap
 * Auto scales image according to target pixel width for selected paper size.
 */
async function imageToEscPosRaster(dataUrl, targetWidthPx = 256) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      // Width must be a multiple of 8 (8 dots per byte)
      const widthBytes = Math.floor(targetWidthPx / 8);
      const width = widthBytes * 8;
      const height = Math.round((img.height / img.width) * width);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Fill white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      // Draw image scaled
      ctx.drawImage(img, 0, 0, width, height);

      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      // GS v 0 m xL xH yL yH
      const xL = widthBytes % 256;
      const xH = Math.floor(widthBytes / 256);
      const yL = height % 256;
      const yH = Math.floor(height / 256);

      const header = new Uint8Array([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
      const rasterData = new Uint8Array(widthBytes * height);

      let byteIdx = 0;
      for (let y = 0; y < height; y++) {
        for (let xByte = 0; xByte < widthBytes; xByte++) {
          let byteVal = 0;
          for (let bit = 0; bit < 8; bit++) {
            const pxX = xByte * 8 + bit;
            const pxIdx = (y * width + pxX) * 4;
            const r = data[pxIdx];
            const g = data[pxIdx + 1];
            const b = data[pxIdx + 2];
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            if (luminance < 128) {
              byteVal |= (1 << (7 - bit));
            }
          }
          rasterData[byteIdx++] = byteVal;
        }
      }

      const fullRaster = new Uint8Array(header.length + rasterData.length);
      fullRaster.set(header, 0);
      fullRaster.set(rasterData, header.length);

      resolve(fullRaster);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Request Web Bluetooth Device Pairing
 */
export async function connectBluetoothPrinter() {
  if (!navigator.bluetooth) {
    throw new Error('WEB_BLUETOOTH_NOT_SUPPORTED');
  }

  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES
    });

    const server = await device.gatt.connect();

    let targetCharacteristic = null;
    const services = await server.getPrimaryServices();

    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          targetCharacteristic = char;
          break;
        }
      }
      if (targetCharacteristic) break;
    }

    if (!targetCharacteristic) {
      throw new Error('NO_WRITEABLE_CHARACTERISTIC');
    }

    return {
      device,
      server,
      characteristic: targetCharacteristic,
      name: device.name || 'Bluetooth Receipt Printer'
    };
  } catch (error) {
    console.error('Bluetooth connection error:', error);
    throw error;
  }
}

/**
 * Send Receipt Data as ESC/POS Raw Bytes via Bluetooth GATT
 * Supports dynamic paper widths: 58mm (32 cols), 72mm (42 cols), 80mm (48 cols)
 * Auto scales logo raster image to paper size.
 */
export async function printReceiptBluetooth(printerConnection, data, settings = {}) {
  const { characteristic } = printerConnection;
  const { tableNumber, sessionId, customerName, items, subtotal, tax, totalAmount, date } = data;

  const paperWidth = settings.paperWidth || '58mm';
  const headerTitle = settings.headerTitle || 'RESTORAN RASA SELERA';
  const headerAddress = settings.headerAddress || 'No. 18, Jalan Telawi 3, Bangsar';
  const footerMsg = settings.footerMsg || 'Terima Kasih! Sila Datang Lagi.';

  // Determine character column count and pixel width for logo based on paper width
  const totalCols = paperWidth === '80mm' ? 48 : paperWidth === '72mm' ? 42 : 32;
  const logoWidthPx = paperWidth === '80mm' ? 384 : paperWidth === '72mm' ? 336 : 256;

  const dividerLine = '='.repeat(totalCols) + '\n';
  const dashLine = '-'.repeat(totalCols) + '\n';

  const chunks = [];
  const append = (bytes) => chunks.push(bytes);
  const appendText = (text) => chunks.push(textToBytes(text));

  append(ESC_POS.INIT);
  
  // Render ESC/POS Logo Raster if uploaded
  if (settings.logoUrl) {
    try {
      const logoRaster = await imageToEscPosRaster(settings.logoUrl, logoWidthPx);
      if (logoRaster) {
        append(ESC_POS.ALIGN_CENTER);
        append(logoRaster);
        append(ESC_POS.FEED_LINE);
      }
    } catch (err) {
      console.warn('Logo raster render error:', err);
    }
  }

  // Header: Custom Restaurant Title & Address
  append(ESC_POS.ALIGN_CENTER);
  append(ESC_POS.BOLD_ON);
  append(ESC_POS.DOUBLE_HEIGHT);
  appendText(`${headerTitle}\n`);
  append(ESC_POS.NORMAL_TEXT);
  append(ESC_POS.BOLD_OFF);
  appendText(`${headerAddress}\n`);
  appendText(dividerLine);

  // Session & Table Info
  append(ESC_POS.ALIGN_LEFT);
  append(ESC_POS.BOLD_ON);
  appendText(`MEJA   : ${tableNumber}\n`);
  append(ESC_POS.BOLD_OFF);
  appendText(`SESI ID: ${sessionId}\n`);
  appendText(`TARIKH : ${date || new Date().toLocaleString('ms-MY')}\n`);
  appendText(dashLine);

  // Items List Header
  append(ESC_POS.BOLD_ON);
  const priceColWidth = 8;
  const nameColWidth = totalCols - priceColWidth - 1;
  const headerStr = "ITEM".padEnd(nameColWidth, ' ') + " " + "RM".padStart(priceColWidth, ' ');
  appendText(`${headerStr}\n`);
  append(ESC_POS.BOLD_OFF);
  appendText(dashLine);

  // If sessionOrders is provided, print orders grouped by Customer Name & Order ID!
  const ordersList = data.sessionOrders && data.sessionOrders.length > 0
    ? data.sessionOrders
    : [{ order_id: 'ORD-1', customer_name: customerName, items: items || [] }];

  ordersList.forEach((ord, ordIdx) => {
    // Section Header for each Order / Customer Name
    append(ESC_POS.BOLD_ON);
    const custName = (ord.customer_name || 'Pelanggan').trim();
    const orderHeader = `ORDER: ${ord.order_id} [${custName}]`;
    appendText(`${orderHeader}\n`);
    if (ord.order_type === 'TAKEAWAY') {
      appendText(`*** [PESANAN BUNGKUS / TAKEAWAY] ***\n`);
    }
    append(ESC_POS.BOLD_OFF);
    appendText(dashLine);

    const safeOrdItems = getSafeItems(ord.items).filter(item => !item.cancelled);
    safeOrdItems.forEach(item => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.price) || 0;
      const qtyName = `${qty}x ${item.name || ''}`;
      const priceStr = (price * qty).toFixed(2);
      const paddedPrice = priceStr.padStart(priceColWidth, ' ');
      
      // Wrap item name across multiple lines cleanly
      const nameLines = wrapText(qtyName, nameColWidth);
      
      const firstLineName = (nameLines[0] || '').padEnd(nameColWidth, ' ');
      appendText(`${firstLineName} ${paddedPrice}\n`);

      for (let i = 1; i < nameLines.length; i++) {
        const continuationName = ('   ' + nameLines[i]).substring(0, nameColWidth).padEnd(nameColWidth, ' ');
        const emptyPrice = ' '.repeat(priceColWidth);
        appendText(`${continuationName} ${emptyPrice}\n`);
      }

      // Options / Modifiers
      if (item.options) {
        const optionLines = wrapText(`> ${item.options}`, totalCols - 2);
        optionLines.forEach(optLine => {
          appendText(`  ${optLine}\n`);
        });
      }

      // Special Notes
      if (item.special_note) {
        const noteLines = wrapText(`Nota: ${item.special_note}`, totalCols - 2);
        noteLines.forEach(noteLine => {
          appendText(`  * ${noteLine}\n`);
        });
      }
    });

    if (ordIdx < ordersList.length - 1) {
      appendText(dashLine);
    }
  });

  appendText(dashLine);

  // Totals & Extra Charges
  const safeSubtotal = Number(subtotal) || 0;
  append(ESC_POS.ALIGN_RIGHT);
  appendText(`Subtotal: RM ${safeSubtotal.toFixed(2)}\n`);

  const validOrders = (data.sessionOrders || []).filter(ord => ord.kitchen_status !== 'CANCELLED');
  const takeawayOrders = validOrders.filter(ord => ord.order_type === 'TAKEAWAY');
  const hasTakeaway = takeawayOrders.length > 0 || Boolean(data.isTakeaway);
  const takeawaySubtotal = takeawayOrders.reduce((sum, ord) => {
    const uncancelled = getSafeItems(ord.items).filter(i => !i.cancelled);
    return sum + uncancelled.reduce((iSum, i) => iSum + ((Number(i.price) || 0) * (Number(i.quantity) || 1)), 0);
  }, 0);
  const takeawayItemCount = takeawayOrders.flatMap(ord => getSafeItems(ord.items)).filter(i => !i.cancelled).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
  const totalItemCount = validOrders.flatMap(ord => getSafeItems(ord.items)).filter(i => !i.cancelled).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);

  const totals = data.totals || calculateReceiptTotals(safeSubtotal, settings, { 
    isTakeaway: hasTakeaway,
    itemCount: totalItemCount,
    takeawayItemCount,
    takeawaySubtotal
  });

  if (totals.enableSst) {
    appendText(`SST (${totals.sstRate}%): RM ${totals.sstAmount.toFixed(2)}\n`);
  }
  if (totals.enableServiceCharge) {
    appendText(`Cas Servis (${totals.serviceChargeRate}%): RM ${totals.serviceChargeAmount.toFixed(2)}\n`);
  }
  if (totals.enableCustomCharge) {
    const customLabel = totals.customChargeType === '%' ? `${totals.customChargeName} (${totals.customChargeAmountVal}%)` : totals.customChargeName;
    appendText(`${customLabel}: RM ${totals.customChargeFinal.toFixed(2)}\n`);
  }
  if (totals.enableTakeawayCharge && totals.isTakeaway && totals.takeawayChargeFinal > 0) {
    const takeawayLabel = totals.takeawayChargeType === '%' ? `Cas Bungkus (${totals.takeawayChargeAmountVal}%)` : `Cas Bungkus (${totals.takeawayItemCount} item)`;
    appendText(`${takeawayLabel}: RM ${totals.takeawayChargeFinal.toFixed(2)}\n`);
  }

  append(ESC_POS.BOLD_ON);
  append(ESC_POS.DOUBLE_HEIGHT);
  appendText(`TOTAL: RM ${totals.grandTotal.toFixed(2)}\n`);
  append(ESC_POS.NORMAL_TEXT);
  append(ESC_POS.BOLD_OFF);
  appendText(dividerLine);

  // DYNAMIC SESSION QR CODE & 15-WORD FEEDBACK INVITATION
  append(ESC_POS.ALIGN_CENTER);
  
  const cleanSessionIdStr = String(sessionId || '').replace(/^SES-/, '');
  const baseUrl = (typeof window !== 'undefined' && window.location) ? window.location.origin : getBackendBaseUrl();
  const tid = localStorage.getItem('fb_tenant_id') || '';
  const tokenParam = data.accessToken ? `&token=${data.accessToken}` : '';
  const qrUrlStr = `${baseUrl}/o?t=${tableNumber}&s=${cleanSessionIdStr}${tid ? '&tid=' + tid : ''}${tokenParam}`;
  const urlBytes = textToBytes(qrUrlStr);
  append(new Uint8Array([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00])); // Model 2
  append(new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x05])); // Module size 5
  append(new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30])); // Error correction L
  append(new Uint8Array([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30])); // Store data
  append(urlBytes);
  append(new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30])); // Print QR code
  append(ESC_POS.FEED_LINE);

  // Centered 15-Word Invitation Text (Wrapped for 80mm & 58mm thermal paper)
  const feedbackMsg = "Bagaimana dengan sajian? Berkongsi dengan kami scan QR untuk berikan maklum balas anda hari ini!";
  const msgLines = wrapText(feedbackMsg, Math.max(totalCols - 4, 20));
  append(ESC_POS.BOLD_ON);
  msgLines.forEach(msgLine => {
    appendText(`${msgLine}\n`);
  });
  append(ESC_POS.BOLD_OFF);
  appendText(dashLine);

  // Footer Message
  append(ESC_POS.ALIGN_CENTER);
  appendText(`${footerMsg}\n\n\n\n`);
  append(ESC_POS.CUT_PAPER);

  const totalBytesLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const fullBuffer = new Uint8Array(totalBytesLength);
  let offset = 0;
  for (const chunk of chunks) {
    fullBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  const chunkSize = 128;
  for (let i = 0; i < fullBuffer.length; i += chunkSize) {
    const subChunk = fullBuffer.slice(i, i + chunkSize);
    await characteristic.writeValue(subChunk);
  }

  return true;
}

/**
 * Send Dynamic Session QR Slip to Bluetooth Thermal Printer
 */
export async function printQRSlipBluetooth(printerConnection, data, settings = {}) {
  const { characteristic } = printerConnection;
  const { tableNumber, sessionId, orderUrl } = data;

  const paperWidth = settings.paperWidth || '58mm';
  const headerTitle = settings.headerTitle || 'RESTORAN RASA SELERA';

  const baseUrl = orderUrl ? orderUrl.split('/order')[0].split('/o')[0] : window.location.origin;
  const cleanSessionId = String(sessionId || '').replace(/^SES-/, '');
  const tid = localStorage.getItem('fb_tenant_id') || '';
  const shortUrl = `${baseUrl}/o?t=${tableNumber}&s=${cleanSessionId}${tid ? '&tid=' + tid : ''}`;

  const logoWidthPx = paperWidth === '80mm' ? 384 : paperWidth === '72mm' ? 336 : 256;

  const chunks = [];
  const append = (bytes) => chunks.push(bytes);
  const appendText = (text) => chunks.push(textToBytes(text));

  append(ESC_POS.INIT);

  // Render ESC/POS Logo Raster if uploaded
  if (settings.logoUrl) {
    try {
      const logoRaster = await imageToEscPosRaster(settings.logoUrl, logoWidthPx);
      if (logoRaster) {
        append(ESC_POS.ALIGN_CENTER);
        append(logoRaster);
        append(ESC_POS.FEED_LINE);
      }
    } catch (err) {
      console.warn('Logo raster render error:', err);
    }
  }

  append(ESC_POS.ALIGN_CENTER);
  append(ESC_POS.BOLD_ON);
  append(ESC_POS.DOUBLE_HEIGHT);
  appendText(`${headerTitle}\n`);
  append(ESC_POS.NORMAL_TEXT);
  append(ESC_POS.BOLD_OFF);
  appendText("================================\n");

  append(ESC_POS.BOLD_ON);
  append(ESC_POS.DOUBLE_HEIGHT);
  appendText(`MEJA ${tableNumber}\n`);
  append(ESC_POS.NORMAL_TEXT);
  append(ESC_POS.BOLD_OFF);
  appendText(`SESI ID: ${sessionId}\n`);
  appendText("--------------------------------\n");

  // GOOJPRT Native ESC/POS Commands
  const urlData = textToBytes(shortUrl);
  const storeLen = urlData.length + 3;
  const pL = storeLen % 256;
  const pH = Math.floor(storeLen / 256);

  append(new Uint8Array([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]));
  append(new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x05]));
  append(new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30]));

  const storeHeader = new Uint8Array([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]);
  append(storeHeader);
  append(urlData);

  append(new Uint8Array([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]));
  append(ESC_POS.FEED_LINE);

  append(ESC_POS.ALIGN_CENTER);
  append(ESC_POS.BOLD_ON);
  appendText("IMBAS QR UNTUK MEMESAN\n");
  append(ESC_POS.BOLD_OFF);
  appendText("Simpan slip ini untuk bayaran\n");
  appendText("di kaunter selepas makan.\n");
  appendText("================================\n\n\n\n");
  append(ESC_POS.CUT_PAPER);

  const totalBytesLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const fullBuffer = new Uint8Array(totalBytesLength);
  let offset = 0;
  for (const chunk of chunks) {
    fullBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  const chunkSize = 128;
  for (let i = 0; i < fullBuffer.length; i += chunkSize) {
    const subChunk = fullBuffer.slice(i, i + chunkSize);
    await characteristic.writeValue(subChunk);
  }

  return true;
}

/**
 * Helper function to determine if an item belongs to the Bar / Drinks Station (Stesen Bar)
 * Performs robust check on:
 * 1. item.category, item.category_name, item.categoryName, item.category_id, item.categoryId, item.type
 * 2. Catalog Lookup via menuItems matching ID or Name
 * 3. Item Name & Options keyword detection (e.g. Air, Minuman, Kopi, Teh, Jus, Soda, Milo, Nescafe, Sirap, Bandung, etc.)
 */
export function isDrinkItem(item, menuItems = []) {
  if (!item) return false;

  // 1. Extract raw category string from item
  const rawCat = (
    item.category ||
    item.category_name ||
    item.categoryName ||
    item.category_id ||
    item.categoryId ||
    item.type ||
    ''
  ).toString().toLowerCase().trim();

  const drinkCategoryKeywords = [
    'minuman', 'air', 'drink', 'drinks', 'beverage', 'beverages', 
    'bar', 'jus', 'juice', 'kopi', 'teh', 'boba', 'soda', 'minum',
    'cat-drink', 'cat_drink', 'cat-minuman', 'cat_minuman', 'cat-air', 'cat_air', 'cat_bar', 'cat-bar'
  ];

  if (rawCat && drinkCategoryKeywords.some(kw => rawCat.includes(kw))) {
    return true;
  }

  // 2. Catalog Lookup by ID or Name if direct category is numeric, empty, or ID reference
  if (menuItems && Array.isArray(menuItems) && menuItems.length > 0) {
    const found = menuItems.find(m =>
      (m.id && item.id && String(m.id) === String(item.id)) ||
      (m.name && item.name && m.name.toLowerCase().trim() === item.name.toLowerCase().trim())
    );

    if (found) {
      const foundCat = (
        found.category ||
        found.category_name ||
        found.categoryName ||
        found.category_id ||
        found.categoryId ||
        found.type ||
        ''
      ).toString().toLowerCase().trim();

      if (foundCat && drinkCategoryKeywords.some(kw => foundCat.includes(kw))) {
        return true;
      }

      const foundName = (found.name || '').toString().toLowerCase().trim();
      if (drinkCategoryKeywords.some(kw => foundName.includes(kw))) {
        return true;
      }
    }
  }

  // 3. Fallback: Check item name & item options for drink keywords
  const rawName = (item.name || item.item_name || '').toString().toLowerCase().trim();
  const rawOptions = (item.options || '').toString().toLowerCase().trim();
  const combinedText = `${rawName} ${rawOptions}`;

  const drinkNameKeywords = [
    'minuman', 'air ', 'air', 'drink', 'drinks', 'beverage', 'beverages', 
    'jus ', 'juice', 'kopi', 'teh ', 'teh', 'boba', 'soda', 'minum',
    'milo', 'nescafe', 'sirap', 'teh o', 'kopi o', 'neslo', 'horlicks', 'ribena',
    'extra joss', 'bandung', 'limau', 'barley', 'blek', 'teh ais', 'kopi ais',
    'cappuccino', 'latte', 'espresso', 'mocha', 'americanu', 'americano', 'smoothie',
    'slurpee', 'frappuccino', 'syrup', 'cordial', 'boba', 'tea'
  ];

  if (drinkNameKeywords.some(kw => combinedText.includes(kw))) {
    return true;
  }

  return false;
}

/**
 * Send Single Ticket to Bluetooth Thermal Printer
 */
async function printSingleTicket(printerConnection, data, settings = {}, ticketTitle = "TIKET WAITER / DAPUR") {
  const { characteristic } = printerConnection;
  const { tableNumber, orderId, customerName, items, orderType, specialNotes } = data;

  if (!items || items.length === 0) return true;

  const paperWidth = settings.paperWidth || '58mm';
  const totalCols = paperWidth === '80mm' ? 48 : paperWidth === '72mm' ? 42 : 32;

  const dividerLine = '='.repeat(totalCols) + '\n';
  const dashLine = '-'.repeat(totalCols) + '\n';

  const chunks = [];
  const append = (bytes) => chunks.push(bytes);
  const appendText = (text) => chunks.push(textToBytes(text));

  append(ESC_POS.INIT);

  // Header Banner
  append(ESC_POS.ALIGN_CENTER);
  append(ESC_POS.BOLD_ON);
  append(ESC_POS.DOUBLE_HEIGHT);
  appendText(`${ticketTitle}\n`);
  append(ESC_POS.NORMAL_TEXT);
  append(ESC_POS.BOLD_OFF);
  appendText(dividerLine);

  // Big Table Number
  append(ESC_POS.ALIGN_CENTER);
  append(ESC_POS.BOLD_ON);
  append(ESC_POS.DOUBLE_HEIGHT);
  appendText(`MEJA ${tableNumber}\n`);
  append(ESC_POS.NORMAL_TEXT);
  append(ESC_POS.BOLD_OFF);

  if (orderType === 'TAKEAWAY') {
    append(ESC_POS.BOLD_ON);
    appendText("*** PESANAN BUNGKUS / TAKEAWAY ***\n");
    append(ESC_POS.BOLD_OFF);
  }

  // Session & Customer Info
  append(ESC_POS.ALIGN_LEFT);
  appendText(`ORDER ID : ${orderId}\n`);
  if (customerName) {
    append(ESC_POS.BOLD_ON);
    appendText(`PELANGGAN: ${customerName}\n`);
    append(ESC_POS.BOLD_OFF);
  }
  appendText(dashLine);

  // Items List Header
  append(ESC_POS.BOLD_ON);
  appendText("SENARAI ITEM:\n");
  append(ESC_POS.BOLD_OFF);

  items.forEach(item => {
    append(ESC_POS.BOLD_ON);
    appendText(`${item.quantity}x ${item.name}\n`);
    append(ESC_POS.BOLD_OFF);

    if (item.options) {
      const optionLines = wrapText(`> ${item.options}`, totalCols - 2);
      optionLines.forEach(optLine => appendText(`  ${optLine}\n`));
    }
    if (item.special_note) {
      const noteLines = wrapText(`* ${item.special_note}`, totalCols - 2);
      noteLines.forEach(noteLine => appendText(`  ${noteLine}\n`));
    }
  });

  if (specialNotes) {
    appendText(dashLine);
    append(ESC_POS.BOLD_ON);
    appendText(`NOTA MEJA: ${specialNotes}\n`);
    append(ESC_POS.BOLD_OFF);
  }

  appendText(dividerLine);
  append(ESC_POS.ALIGN_CENTER);
  append(ESC_POS.BOLD_ON);
  appendText(`SILA HANTAR KE MEJA ${tableNumber}\n\n\n\n`);
  append(ESC_POS.BOLD_OFF);
  append(ESC_POS.CUT_PAPER);

  const totalBytesLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const fullBuffer = new Uint8Array(totalBytesLength);
  let offset = 0;
  for (const chunk of chunks) {
    fullBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  const chunkSize = 128;
  for (let i = 0; i < fullBuffer.length; i += chunkSize) {
    const subChunk = fullBuffer.slice(i, i + chunkSize);
    await characteristic.writeValue(subChunk);
  }

  return true;
}

/**
 * Send Split Kitchen & Bar Tickets to Bluetooth Thermal Printer
 * Splitting food items (TIKET DAPUR) and drink items (TIKET BAR) with a 400ms delay to prevent buffer overflow!
 */
export async function printKitchenRunnerTicketBluetooth(printerConnection, data, settings = {}, stationFilter = 'ALL', menuItems = []) {
  const { items } = data;
  if (!items || items.length === 0) return true;

  const foodItems = items.filter(item => !isDrinkItem(item, menuItems));
  const drinkItems = items.filter(item => isDrinkItem(item, menuItems));

  // If printing specifically for FOOD station: WAJIB KELUAR ITEM MAKANAN SAHAJA
  if (stationFilter === 'FOOD') {
    if (foodItems.length > 0) {
      await printSingleTicket(printerConnection, { ...data, items: foodItems }, settings, "TIKET DAPUR (MAKANAN)");
    }
    return true;
  }

  // If printing specifically for BAR station: WAJIB KELUAR ITEM MINUMAN SAHAJA
  if (stationFilter === 'BAR') {
    if (drinkItems.length > 0) {
      await printSingleTicket(printerConnection, { ...data, items: drinkItems }, settings, "TIKET BAR (MINUMAN)");
    }
    return true;
  }

  // If stationFilter === 'ALL', print food ticket first, then bar ticket
  if (foodItems.length > 0) {
    await printSingleTicket(printerConnection, { ...data, items: foodItems }, settings, "TIKET DAPUR (MAKANAN)");
  }

  if (foodItems.length > 0 && drinkItems.length > 0) {
    await new Promise(res => setTimeout(res, 400));
  }

  if (drinkItems.length > 0) {
    await printSingleTicket(printerConnection, { ...data, items: drinkItems }, settings, "TIKET BAR (MINUMAN)");
  }

  return true;
}
