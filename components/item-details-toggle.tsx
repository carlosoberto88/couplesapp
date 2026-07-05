"use client";

import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type ItemDetailsToggleProps = {
  expanded: boolean;
  onToggle: () => void;
};

export function ItemDetailsToggle({ expanded, onToggle }: ItemDetailsToggleProps) {
  const tItems = useTranslations("items");

  return (
    <button
      type="button"
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      onClick={onToggle}
      aria-expanded={expanded}
    >
      <ChevronDown
        className={cn("size-4 transition-transform", expanded && "rotate-180")}
        aria-hidden
      />
      {tItems("optionalDetails")}
    </button>
  );
}
