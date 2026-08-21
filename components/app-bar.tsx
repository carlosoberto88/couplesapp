import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

type AppBarProps = {
  /** Screen title. When present, replaces the "Couples" wordmark. */
  title?: string;
  /** Right-side slot for actions (e.g. "New list", sign-out). */
  children?: ReactNode;
};

export async function AppBar({ title, children }: AppBarProps) {
  const t = await getTranslations("common");

  return (
    <header className="glass-chrome sticky top-0 z-40 border-b border-border pt-safe">
      <div className="mx-auto flex h-14 w-full max-w-[640px] items-center justify-between gap-2 px-4">
        {title ? (
          <span className="min-w-0 truncate font-display text-lg font-bold text-foreground">
            {title}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 font-display text-lg font-bold text-foreground">
            {t("appName")}
            <span
              aria-hidden
              className="mb-2 size-1.5 rounded-full bg-primary"
            />
          </span>
        )}
        {children ? (
          <div className="flex items-center gap-2 shrink-0">{children}</div>
        ) : null}
      </div>
    </header>
  );
}
