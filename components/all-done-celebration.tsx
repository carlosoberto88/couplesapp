"use client";

import { useEffect, useState } from "react";

type AllDoneCelebrationProps = {
  active: boolean;
};

export function AllDoneCelebration({ active }: AllDoneCelebrationProps) {
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (!active) return;
    setBurst(true);
    const timer = setTimeout(() => setBurst(false), 1200);
    return () => clearTimeout(timer);
  }, [active]);

  if (!burst) return null;

  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    left: `${10 + ((i * 37) % 80)}%`,
    delay: `${(i % 6) * 0.04}s`,
    // keep in sync with app/globals.css :root (--duo-coral/--duo-teal/--duo-gold + coral tint)
    color: ["#e8674c", "#2fa39b", "#e6b54a", "#fbe3dc"][i % 4],
  }));

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className="confetti-particle absolute top-1/3 size-2 rounded-full"
          style={{
            left: p.left,
            backgroundColor: p.color,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
}
