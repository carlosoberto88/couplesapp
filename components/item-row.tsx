"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronRight, GripVertical, Link2, X } from "lucide-react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";

import type { Item } from "@/lib/types";
import type { ItemUpdatePatch } from "@/lib/item-mutations";
import type { MemberColor } from "@/lib/member-colors";
import { UNKNOWN_MEMBER_COLOR } from "@/lib/member-colors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ItemRowDragHandleProps = {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
};

type ItemRowProps = {
  item: Item;
  adderColor: MemberColor;
  checkerColor: MemberColor | null;
  imageUrl: string | null;
  hasImages: boolean;
  listRecurring?: boolean;
  showAisle?: boolean;
  dragHandleProps?: ItemRowDragHandleProps;
  dragActivatorRef?: (node: HTMLElement | null) => void;
  dragRef?: (node: HTMLLIElement | null) => void;
  dragStyle?: CSSProperties;
  onToggle: (item: Item) => void;
  onOpenDetail: (item: Item) => void;
  onRemove: (item: Item) => void;
  onEdit?: (item: Item, patch: ItemUpdatePatch) => void;
};

export function ItemRow({
  item,
  adderColor,
  checkerColor,
  imageUrl,
  hasImages,
  listRecurring = false,
  showAisle = false,
  dragHandleProps,
  dragActivatorRef,
  dragRef,
  dragStyle,
  onToggle,
  onOpenDetail,
  onRemove,
  onEdit,
}: ItemRowProps) {
  const t = useTranslations("items");
  const checked = item.checked_at !== null;
  const checkColor = checkerColor ?? UNKNOWN_MEMBER_COLOR;

  return (
    <li
      ref={dragRef}
      className="animate-item-in motion-reduce:animate-none flex min-h-11 items-start gap-3 rounded-2xl border border-border bg-card px-3 py-2.5"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: adderColor.color,
        backgroundColor: checked ? checkColor.tint : undefined,
        ...dragStyle,
      }}
    >
      <span className="sr-only">{t("addedBy")}</span>

      {dragHandleProps && (
        <button
          type="button"
          ref={dragActivatorRef}
          aria-label={t("reorderItem", { name: item.name })}
          className="mt-0.5 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      )}

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
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "truncate text-sm text-foreground",
                checked && "line-through",
              )}
            >
              {item.name}
            </span>
            {showAisle && item.aisle && (
              <span
                className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                aria-label={t("aisleChipLabel", { aisle: item.aisle })}
              >
                {item.aisle}
              </span>
            )}
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

      {listRecurring && item.is_extra && onEdit && (
        <button
          type="button"
          onClick={() => onEdit(item, { is_extra: false })}
          className="mt-0.5 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {t("oneTimeChip")}
        </button>
      )}

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
