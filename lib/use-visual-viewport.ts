import { useEffect, useState } from "react";

export type VisualViewportSize = {
  height: number;
  offsetTop: number;
};

function getVisualViewportSize(): VisualViewportSize {
  if (typeof window === "undefined") {
    return { height: 0, offsetTop: 0 };
  }

  const vv = window.visualViewport;
  if (vv) {
    return { height: vv.height, offsetTop: vv.offsetTop };
  }

  return { height: window.innerHeight, offsetTop: 0 };
}

export function useVisualViewport(enabled = true): VisualViewportSize {
  const [size, setSize] = useState<VisualViewportSize>(() => getVisualViewportSize());

  useEffect(() => {
    if (!enabled) return;

    let rafId = 0;

    const update = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setSize(getVisualViewportSize());
      });
    };

    update();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      cancelAnimationFrame(rafId);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled]);

  return size;
}
