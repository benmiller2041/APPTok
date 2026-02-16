"use client";

import { useEffect } from "react";

/**
 * Loads Eruda (mobile console debugger) from CDN.
 * Shows a floating gear icon that opens a full console panel
 * with logs, network, elements, etc.
 *
 * Remove this component (and its usage in layout.tsx) when
 * you no longer need mobile debugging.
 */
export function MobileDebugger() {
  useEffect(() => {
    // Only load once
    if ((window as any).__ERUDA_LOADED__) return;
    (window as any).__ERUDA_LOADED__ = true;

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/eruda@3.4.0/eruda.min.js";
    script.async = true;
    script.onload = () => {
      const eruda = (window as any).eruda;
      if (eruda) {
        eruda.init();
        console.log("[MobileDebugger] Eruda initialized ✓");
      }
    };
    script.onerror = () => {
      console.warn("[MobileDebugger] Failed to load Eruda from CDN");
    };
    document.head.appendChild(script);
  }, []);

  return null;
}
