import { useEffect, type RefObject } from "react";

const CSS_VAR = "--sticky-add-bar-height";

export function useStickyAddBarHeight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function syncHeight() {
      if (!el) return;
      const height = el.offsetHeight;
      if (height > 0) {
        document.documentElement.style.setProperty(CSS_VAR, `${height}px`);
      } else {
        document.documentElement.style.removeProperty(CSS_VAR);
      }
    }

    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(el);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(CSS_VAR);
    };
  }, [ref]);
}
