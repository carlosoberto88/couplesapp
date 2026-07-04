import type { ReactNode } from "react";

type AppBarProps = {
  /** Right-side slot for actions (e.g. "New list", sign-out). */
  children?: ReactNode;
};

/**
 * Slim sticky top bar with the "Couples" wordmark. Server-component-friendly
 * — any interactive controls are passed in via `children` from the caller.
 */
export function AppBar({ children }: AppBarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 w-full max-w-[640px] items-center justify-between gap-2 px-4">
        <span className="flex items-center gap-1.5 font-display text-lg font-bold text-foreground">
          Couples
          <span
            aria-hidden
            className="mb-2 size-1.5 rounded-full bg-primary"
          />
        </span>
        {children ? (
          <div className="flex items-center gap-2">{children}</div>
        ) : null}
      </div>
    </header>
  );
}
