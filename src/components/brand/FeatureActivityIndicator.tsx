import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BRAND_LOGO_URL } from './Logo.tsx';

export function FeatureActivityIndicator() {
  const { pathname, search } = useLocation();
  const [active, setActive] = useState(false);
  const timerRef = useRef<number | null>(null);
  const isFirstRenderRef = useRef(true);

  const triggerRoll = (durationMs = 520) => {
    setActive(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setActive(false);
      timerRef.current = null;
    }, durationMs);
  };

  // Trigger rolling logo on route/feature navigation
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    triggerRoll(520);
  }, [pathname, search]);

  // Trigger rolling logo whenever a user presses any feature link or action button
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // If opening a custom dropdown, clear any lingering transition overlay so the listbox is crisp
      if (target.closest('[role="combobox"], [role="listbox"], [role="option"]')) {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setActive(false);
        return;
      }

      const interactive = target.closest(
        'a[href], button:not([disabled]):not([aria-haspopup="listbox"]):not([role="combobox"]):not([role="option"]):not([data-no-roll]), [role="tab"]',
      ) as HTMLElement | null;

      if (!interactive) return;
      if (interactive.getAttribute('aria-disabled') === 'true') return;

      triggerRoll(450);
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!active) {
    return null;
  }

  return (
    <div
      data-testid="rolling-logo-indicator"
      data-active="true"
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[90]"
    >
      <div className="elastic-panel-swap flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-xl ring-1 ring-[#0F172A]/10 backdrop-blur-sm">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white p-1.5 shadow-sm">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1 rounded-full border-2 border-transparent border-t-[#2563EB] border-r-[#1E3A8A] motion-safe:animate-spin"
          />
          <img
            src={BRAND_LOGO_URL}
            alt="Loading feature"
            referrerPolicy="no-referrer"
            className="h-full w-full object-contain motion-safe:animate-logo-roll select-none"
          />
        </div>
        <span className="text-xs font-semibold tracking-wide text-[#1E3A8A] whitespace-nowrap">
          Opening feature...
        </span>
      </div>
    </div>
  );
}
