/**
 * Safe helper to round money to 2 decimal places, preventing floating point precision issues (e.g. 0.30000000000000004).
 */
export function roundMoney(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

/**
 * Calculates Subtotal, Tax (SST), Service Charge, Custom Charges, Takeaway Charge, Grand Total, and Label text
 * based on receipt settings and orders subtotal.
 */
export function calculateReceiptTotals(subtotal = 0, settings = {}, options = {}) {
  const cleanSubtotal = roundMoney(subtotal);
  const isTakeaway = Boolean(options.isTakeaway);

  // 1. SST (Cukai Perkhidmatan) — default false (no extra tax added to total)
  const enableSst = Boolean(settings.enableSst);
  const sstRate = settings.sstRate !== undefined && settings.sstRate !== null ? Number(settings.sstRate) : 0;
  const sstAmount = roundMoney(enableSst ? (cleanSubtotal * (sstRate / 100)) : 0);

  // 2. Service Charge (Cas Perkhidmatan)
  const enableServiceCharge = Boolean(settings.enableServiceCharge);
  const serviceChargeRate = Number(settings.serviceChargeRate || 10);
  const serviceChargeAmount = roundMoney(enableServiceCharge ? (cleanSubtotal * (serviceChargeRate / 100)) : 0);

  // 3. Custom Charge (Cas Tambahan General)
  const enableCustomCharge = Boolean(settings.enableCustomCharge);
  const customChargeName = settings.customChargeName || 'Cas Tambahan';
  const customChargeType = settings.customChargeType || 'RM'; // 'RM' or '%'
  const customChargeAmountVal = Number(settings.customChargeAmount || 0);
  const customChargeFinal = roundMoney(enableCustomCharge
    ? (customChargeType === '%' ? cleanSubtotal * (customChargeAmountVal / 100) : customChargeAmountVal)
    : 0);

  // 4. Cas Bungkus (Takeaway Charge) — Auto-applied ONLY if Admin enabled AND order is Takeaway!
  // Multiplied ONLY by takeaway item quantity count (Dine-In items excluded!)
  const enableTakeawayCharge = Boolean(settings.enableTakeawayCharge);
  const takeawayChargeType = settings.takeawayChargeType || 'RM';
  const takeawayChargeAmountVal = Number(settings.takeawayChargeAmount || 0);
  const itemCount = Number(options.itemCount) && Number(options.itemCount) > 0 ? Number(options.itemCount) : 1;
  const takeawayItemCount = options.takeawayItemCount !== undefined
    ? Number(options.takeawayItemCount)
    : (isTakeaway ? itemCount : 0);
  const takeawaySubtotal = options.takeawaySubtotal !== undefined
    ? Number(options.takeawaySubtotal)
    : cleanSubtotal;

  let takeawayChargeFinal = 0;
  if (enableTakeawayCharge && isTakeaway && takeawayItemCount > 0) {
    if (takeawayChargeType === '%') {
      takeawayChargeFinal = roundMoney(takeawaySubtotal * (takeawayChargeAmountVal / 100));
    } else {
      takeawayChargeFinal = roundMoney(takeawayChargeAmountVal * takeawayItemCount);
    }
  }

  const grandTotal = roundMoney(cleanSubtotal + sstAmount + serviceChargeAmount + customChargeFinal + takeawayChargeFinal);

  // Summary Label text
  const chargesList = [];
  if (enableSst && sstRate > 0) chargesList.push(`SST ${sstRate}%`);
  if (enableServiceCharge && serviceChargeRate > 0) chargesList.push(`Servis ${serviceChargeRate}%`);
  if (enableCustomCharge && customChargeFinal > 0) chargesList.push(customChargeName);
  if (enableTakeawayCharge && isTakeaway && takeawayChargeFinal > 0) {
    if (takeawayChargeType === 'RM') {
      chargesList.push(`Cas Bungkus RM ${takeawayChargeAmountVal.toFixed(2)}${takeawayItemCount > 1 ? ` x ${takeawayItemCount}` : ''}`);
    } else {
      chargesList.push(`Cas Bungkus ${takeawayChargeAmountVal}%`);
    }
  }

  const labelText = chargesList.length > 0
    ? `termasuk ${chargesList.join(' + ')}`
    : 'harga bersih (tanpa cas)';

  return {
    subtotal: cleanSubtotal,
    enableSst,
    sstRate,
    sstAmount,
    enableServiceCharge,
    serviceChargeRate,
    serviceChargeAmount,
    enableCustomCharge,
    customChargeName,
    customChargeType,
    customChargeAmountVal,
    customChargeFinal,
    enableTakeawayCharge,
    takeawayChargeType,
    takeawayChargeAmountVal,
    takeawayChargeFinal,
    itemCount,
    takeawayItemCount,
    isTakeaway,
    grandTotal,
    labelText
  };
}
