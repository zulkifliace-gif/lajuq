/**
 * Utility to calculate 4-month subscription cycle quota & countdown timer.
 * Free Plan Limit: 100 orders per 4-month period (auto-renew every 4 months).
 */

export const FREE_PLAN_LIMIT = 100;

/**
 * Calculates current 4-month cycle window based on tenant created_at date.
 */
export function getSubscriptionCycleInfo(createdAtIso) {
  const start = createdAtIso ? new Date(createdAtIso) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  let cycleStart = new Date(start);
  let cycleEnd = new Date(start);
  cycleEnd.setMonth(cycleEnd.getMonth() + 4);

  // Advance 4 months iteratively until cycleEnd is in the future
  while (now >= cycleEnd) {
    cycleStart = new Date(cycleEnd);
    cycleEnd.setMonth(cycleEnd.getMonth() + 4);
  }

  return { cycleStart, cycleEnd };
}

/**
 * Counts total orders used in current 4-month cycle.
 */
export function getCycleOrdersCount(orders = [], tenantId = null, cycleStart = null) {
  if (!orders || !orders.length) return 0;

  return orders.filter(order => {
    // Match tenant if tenantId is provided
    if (tenantId && order.tenant_id && order.tenant_id !== tenantId) {
      return false;
    }
    // Match date window if cycleStart is provided
    if (cycleStart) {
      const orderDate = new Date(order.created_at || order.createdAt || order.timestamp || Date.now());
      return orderDate >= cycleStart;
    }
    return true;
  }).length;
}

/**
 * Checks if tenant is on Free Plan (or Demo/Trialing without paid subscription).
 */
export function isFreePlan(tenant) {
  if (!tenant) return true; // Default fallback
  const status = tenant.subscription_status;
  const plan = (tenant.plan_type || '').toLowerCase();

  // Paid active plans are NOT free plans
  if (status === 'active' && plan !== 'free' && plan !== 'percuma' && plan !== 'starter_trial') {
    return false;
  }
  return true;
}

/**
 * Formats remaining time into "X Bulan X Hari X Jam X Minit X Saat"
 */
export function formatCountdown(cycleEnd) {
  if (!cycleEnd) return '0 Minit 0 Saat';

  const now = new Date();
  const diffMs = new Date(cycleEnd) - now;

  if (diffMs <= 0) return '0 Minit 0 Saat (Memperbaharui...)';

  const secondsTotal = Math.floor(diffMs / 1000);
  const minutesTotal = Math.floor(secondsTotal / 60);
  const hoursTotal = Math.floor(minutesTotal / 60);
  const daysTotal = Math.floor(hoursTotal / 24);

  const months = Math.floor(daysTotal / 30);
  const days = daysTotal % 30;
  const hours = hoursTotal % 24;
  const minutes = minutesTotal % 60;
  const seconds = secondsTotal % 60;

  const parts = [];
  if (months > 0) parts.push(`${months} Bulan`);
  if (days > 0 || months > 0) parts.push(`${days} Hari`);
  parts.push(`${hours} Jam`);
  parts.push(`${minutes} Minit`);
  parts.push(`${seconds} Saat`);

  return parts.join(' ');
}
