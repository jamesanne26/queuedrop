"use client";

import { useEffect, useState } from "react";

type Props = {
  anchorId: string;
  value: string;
  label: string;
};

export function StickyPositionIndicator({ anchorId, value, label }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const anchor = document.getElementById(anchorId);
    if (!anchor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setShow(!entry.isIntersecting),
      { threshold: 0.15 },
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [anchorId]);

  if (!show) return null;

  return (
    <div className="customer-sticky-position" role="status" aria-live="polite">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
