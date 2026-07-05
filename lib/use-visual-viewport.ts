import { useEffect, useState } from "react";

export type VisualViewportSize = {
  height: number;
  width: number;
  offsetTop: number;
  offsetLeft: number;
  keyboardInset: number;
};

function getVisualViewportSize(): VisualViewportSize {
  if (typeof window === "undefined") {
    return { height: 0, width: 0, offsetTop: 0, offsetLeft: 0, keyboardInset: 0 };
  }

  const vv = window.visualViewport;
  const height = vv?.height ?? window.innerHeight;
  const width = vv?.width ?? window.innerWidth;
  const offsetTop = vv?.offsetTop ?? 0;
  const offsetLeft = vv?.offsetLeft ?? 0;
  const keyboardInset = window.innerHeight - offsetTop - height;

  return { height, width, offsetTop, offsetLeft, keyboardInset };
}

export function useVisualViewport(enabled = true): VisualViewportSize {
  const [size, setSize] = useState<VisualViewportSize>(() => getVisualViewportSize());

  useEffect(() => {
    if (!enabled) return;

    let rafId = 0;
    let focusTimeoutId = 0;

    const update = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setSize(getVisualViewportSize());
      });
    };

    const handleFocusIn = () => {
      window.clearTimeout(focusTimeoutId);
      focusTimeoutId = window.setTimeout(update, 100);
    };

    update();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(focusTimeoutId);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [enabled]);

  return size;
}
