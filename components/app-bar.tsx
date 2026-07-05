import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

type AppBarProps = {
  /** Right-side slot for actions (e.g. "New list", sign-out). */
  children?: ReactNode;
};

export async function AppBar({ children }: AppBarProps) {
  const t = await getTranslations("common");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-safe backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 w-full max-w-[640px] items-center justify-between gap-2 px-4">
        <span className="flex items-center gap-1.5 font-display text-lg font-bold text-foreground">
          {t("appName")}
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
