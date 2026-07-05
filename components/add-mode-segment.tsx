"use client";

import { useTranslations } from "next-intl";
import { Link2, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";

export type AddMode = "link" | "manual";

type AddModeSegmentProps = {
  mode: AddMode;
  onChange: (mode: AddMode) => void;
  compact?: boolean;
};

export function AddModeSegment({ mode, onChange, compact = false }: AddModeSegmentProps) {
  const t = useTranslations("addFromLink");

  return (
    <div
      role="tablist"
      aria-label={t("modeSegmentLabel")}
      className={cn(
        "flex rounded-xl bg-muted p-1",
        compact ? "h-10" : "h-11",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "link"}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors",
          compact ? "px-2" : "px-3",
          mode === "link"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onChange("link")}
      >
        <Link2 className="size-4 shrink-0" aria-hidden />
        <span className={cn(compact && "truncate")}>{t("modeLink")}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "manual"}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors",
          compact ? "px-2" : "px-3",
          mode === "manual"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onChange("manual")}
      >
        <Pencil className="size-4 shrink-0" aria-hidden />
        <span className={cn(compact && "truncate")}>{t("modeManual")}</span>
      </button>
    </div>
  );
}
