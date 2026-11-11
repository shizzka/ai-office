'use client';
import { useEffect, useState } from 'react';
import { EMPTY_QUOTAS, officeHoliday, publicQuotas, type QuotaSignal } from './officeHoliday';

export function useOfficeHoliday() {
  const [signal, setSignal] = useState<QuotaSignal>(EMPTY_QUOTAS);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const seconds = () => Date.now() / 1000;
    setNow(seconds());
    // Demo links are launched by the director registry, alongside all other scenes.
    const poll = async () => {
      try {
        const response = await fetch('/api/office/limits', { cache: 'no-store' });
        if (response.ok) {
          const value: unknown = await response.json();
          if (!cancelled) setSignal(publicQuotas(value));
        }
      } catch { /* keep the last observation; the clock still expires it */ }
    };
    void poll();
    const pollTimer = setInterval(poll, 20_000);
    const clockTimer = setInterval(() => setNow(seconds()), 1000);
    const focus = () => { setNow(seconds()); void poll(); };
    window.addEventListener('focus', focus);
    return () => { cancelled = true; clearInterval(pollTimer); clearInterval(clockTimer); window.removeEventListener('focus', focus); };
  }, []);
  return { holiday: officeHoliday(signal, now), now };
}
