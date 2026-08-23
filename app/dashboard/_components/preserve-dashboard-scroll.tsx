"use client";
import { useEffect } from "react";

export function PreserveDashboardScroll() {
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const key = `qd-scroll:${location.pathname}`;
    const saved = sessionStorage.getItem(key);
    if (saved) requestAnimationFrame(() => window.scrollTo(0, Number(saved)));
    const remember = () => sessionStorage.setItem(key, String(window.scrollY));
    document.addEventListener("submit", remember, true);
    window.addEventListener("beforeunload", remember);
    return () => {
      document.removeEventListener("submit", remember, true);
      window.removeEventListener("beforeunload", remember);
    };
  }, []);
  return null;
}
