import React, { useState, useEffect } from 'react';
import { ShieldCheck, Sparkles, AlertTriangle } from 'lucide-react';
import { getSubscriptionCycleInfo, getCycleOrdersCount, formatCountdown, FREE_PLAN_LIMIT } from '../utils/subscriptionQuota';

export default function FreePlanBadge({ tenant, orders = [], onUpgradeClick, isMobile = false }) {
  const { cycleStart, cycleEnd } = getSubscriptionCycleInfo(tenant?.created_at);
  const usedOrders = getCycleOrdersCount(orders, tenant?.id, cycleStart);
  const isLimitReached = usedOrders >= FREE_PLAN_LIMIT;

  const [countdown, setCountdown] = useState(() => formatCountdown(cycleEnd));

  useEffect(() => {
    if (!isLimitReached) return;

    const interval = setInterval(() => {
      setCountdown(formatCountdown(cycleEnd));
    }, 1000);

    return () => clearInterval(interval);
  }, [isLimitReached, cycleEnd]);

  if (isMobile) {
    return (
      <div className="space-y-2.5">
        <div className={`inline-flex flex-col gap-1.5 p-3 rounded-xl text-xs font-bold w-full ${
          isLimitReached 
            ? 'bg-rose-100 text-rose-900 border border-rose-300 shadow-sm' 
            : 'bg-amber-100 text-amber-900 border border-amber-200'
        }`}>
          <div className="flex items-center gap-1.5 font-extrabold">
            {isLimitReached ? <AlertTriangle className="w-4 h-4 text-rose-600 animate-bounce shrink-0" /> : <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />}
            <span>
              {isLimitReached ? (
                'Had 100 Pesanan Percuma Dicapai!'
              ) : (
                <>
                  Status Sekarang: Plan Percuma{' '}
                  <span className="px-2 py-0.5 ml-1 bg-amber-300 text-black rounded-full font-mono text-[11px] font-black border border-amber-400 shadow-2xs">
                    ({usedOrders}/100 pesanan)
                  </span>
                </>
              )}
            </span>
          </div>
          {isLimitReached && (
            <div className="text-[11px] font-medium text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
              ⏱️ Renew automatik dalam: <div className="font-extrabold font-mono text-rose-900 text-xs mt-0.5">{countdown}</div>
            </div>
          )}
        </div>
        <button
          onClick={onUpgradeClick}
          className="w-full py-2.5 px-4 bg-gradient-to-r from-[#F04D23] to-[#FF7F27] text-white font-extrabold text-xs rounded-xl shadow-md shadow-[#F04D23]/20 flex items-center justify-center gap-1.5 transition active:scale-95"
        >
          <Sparkles className="w-4 h-4" />
          <span>Upgrade Langganan</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-xs ${
        isLimitReached 
          ? 'bg-rose-100 border border-rose-300 text-rose-900' 
          : 'bg-amber-100 border border-amber-300 text-amber-900'
      }`}>
        {isLimitReached ? <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse shrink-0" /> : <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />}
        {isLimitReached ? (
          <span className="flex items-center gap-2">
            <span className="font-extrabold text-rose-800">Had 100 Pesanan Dicapai!</span>
            <span className="text-[11px] font-mono bg-rose-200 px-2.5 py-0.5 rounded-full border border-rose-300">
              Renew dalam: <strong className="text-rose-900 font-bold">{countdown}</strong>
            </span>
          </span>
        ) : (
          <span>
            Status Sekarang: Plan Percuma{' '}
            <span className="px-2.5 py-0.5 ml-1 bg-amber-300 text-black rounded-full font-mono text-[11px] font-black border border-amber-400 shadow-xs">
              ({usedOrders}/100 pesanan)
            </span>
          </span>
        )}
      </div>

      <button
        onClick={onUpgradeClick}
        className="px-4 py-2 bg-gradient-to-r from-[#F04D23] to-[#FF7F27] hover:brightness-110 text-white font-extrabold text-xs rounded-full shadow-md shadow-[#F04D23]/25 flex items-center gap-1.5 transition transform hover:-translate-y-0.5 active:scale-95"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>Upgrade Langganan</span>
      </button>
    </div>
  );
}
