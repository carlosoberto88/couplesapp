"use client";

import { useTranslations } from "next-intl";
import { Check, ChevronRight, Link2, X } from "lucide-react";

import type { Item } from "@/lib/types";
import type { MemberColor } from "@/lib/member-colors";
import { UNKNOWN_MEMBER_COLOR } from "@/lib/member-colors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ItemRowProps = {
  item: Item;
  adderColor: MemberColor;
  checkerColor: MemberColor | null;
  imageUrl: string | null;
  hasImages: boolean;
  onToggle: (item: Item) => void;
  onOpenDetail: (item: Item) => void;
  onRemove: (item: Item) => void;
};

export function ItemRow({
  item,
  adderColor,
  checkerColor,
  imageUrl,
  hasImages,
  onToggle,
  onOpenDetail,
  onRemove,
}: ItemRowProps) {
  const t = useTranslations("items");
  const checked = item.checked_at !== null;
  const checkColor = checkerColor ?? UNKNOWN_MEMBER_COLOR;

  return (
    <li
      className="animate-item-in motion-reduce:animate-none flex min-h-11 items-start gap-3 rounded-2xl border border-border bg-card px-3 py-2.5"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: adderColor.color,
        backgroundColor: checked ? checkColor.tint : undefined,
      }}
    >
      <span className="sr-only">{t("addedBy")}</span>

      <button
        type="button"
        aria-label={checked ? t("uncheckItem", { name: item.name }) : t("checkItem", { name: item.name })}
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          checked
            ? "border-transparent text-primary-foreground animate-check-pop motion-reduce:animate-none"
            : "border-input",
        )}
        style={checked ? { backgroundColor: checkColor.color } : undefined}
        onClick={() => onToggle(item)}
      >
        {checked && <Check className="size-3" />}
      </button>

      {checked && <span className="sr-only">{t("completedBy")}</span>}

      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-2 text-left"
        onClick={() => onOpenDetail(item)}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={t("photoAlt", { name: item.name })}
            className="size-10 shrink-0 rounded-lg object-cover"
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <span
            className={cn("block text-sm text-foreground", checked && "line-through")}
          >
            {item.name}
          </span>
          {item.note && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.note}</span>
          )}
          {(item.url || hasImages) && (
            <span className="mt-1 flex items-center gap-2 text-muted-foreground">
              {item.url && <Link2 className="size-3" aria-hidden />}
              {hasImages && (
                <span className="text-[10px] font-medium uppercase tracking-wide">{t("hasPhotos")}</span>
              )}
            </span>
          )}
        </div>

        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(item)}
        aria-label={t("removeItem", { name: item.name })}
      >
        <X />
      </Button>
    </li>
  );
}
