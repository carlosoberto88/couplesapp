"use client";

import type { CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronRight, GripVertical, Link2, UserPlus, X } from "lucide-react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";

import type { Item } from "@/lib/types";
import type { ItemUpdatePatch } from "@/lib/item-mutations";
import { nextAssignee } from "@/lib/item-mutations";
import type { MemberColor } from "@/lib/member-colors";
import { UNKNOWN_MEMBER_COLOR } from "@/lib/member-colors";
import { formatPrice } from "@/lib/wishlist-utils";
import { Button } from "@/components/ui/button";
import { MemberAvatar } from "@/components/member-avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ItemRowDragHandleProps = {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
};

export type ItemRowAssignMember = {
  id: string;
  name: string;
  initials: string;
  color: MemberColor;
};

type ItemRowProps = {
  item: Item;
  adderColor: MemberColor;
  checkerColor: MemberColor | null;
  imageUrl: string | null;
  hasImages: boolean;
  listRecurring?: boolean;
  showAisle?: boolean;
  /** Big-tap variant for shopping-now focus mode — larger checkbox + row padding, same behavior. */
  focusMode?: boolean;
  dragHandleProps?: ItemRowDragHandleProps;
  dragActivatorRef?: (node: HTMLElement | null) => void;
  dragRef?: (node: HTMLLIElement | null) => void;
  dragStyle?: CSSProperties;
  onToggle: (item: Item) => void;
  onOpenDetail: (item: Item) => void;
  onRemove: (item: Item) => void;
  onEdit?: (item: Item, patch: ItemUpdatePatch) => void;
  assignMembers?: ItemRowAssignMember[];
  currentUserId?: string;
  onAssign?: (item: Item, userId: string | null) => void;
};

export function ItemRow({
  item,
  adderColor,
  checkerColor,
  imageUrl,
  hasImages,
  listRecurring = false,
  showAisle = false,
  focusMode = false,
  dragHandleProps,
  dragActivatorRef,
  dragRef,
  dragStyle,
  onToggle,
  onOpenDetail,
  onRemove,
  onEdit,
  assignMembers,
  currentUserId,
  onAssign,
}: ItemRowProps) {
  const t = useTranslations("items");
  const locale = useLocale();
  const checked = item.checked_at !== null;
  const checkColor = checkerColor ?? UNKNOWN_MEMBER_COLOR;
  const assignEnabled = !!(onAssign && assignMembers && currentUserId);
  const assignee = item.assigned_to
    ? (assignMembers?.find((m) => m.id === item.assigned_to) ?? null)
    : null;

  return (
    <li
      ref={dragRef}
      className={cn(
        "animate-item-in motion-reduce:animate-none flex min-h-11 items-start gap-3 rounded-2xl border border-border bg-card px-3 py-2.5",
        focusMode && "min-h-14 gap-4 px-4 py-4",
      )}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: adderColor.color,
        backgroundColor: checked ? checkColor.tint : assignee ? assignee.color.tint : undefined,
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
          "mt-0.5 flex shrink-0 items-center justify-center rounded-full border transition-colors",
          focusMode ? "size-8" : "size-5",
          checked
            ? "border-transparent text-primary-foreground animate-check-pop motion-reduce:animate-none"
            : "border-input",
        )}
        style={checked ? { backgroundColor: checkColor.color } : undefined}
        onClick={() => onToggle(item)}
      >
        {checked && <Check className={focusMode ? "size-4" : "size-3"} />}
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
                "truncate text-foreground",
                focusMode ? "text-base font-medium" : "text-sm",
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
          {item.price !== null && (
            <span className="mt-0.5 block text-xs font-medium tabular-nums text-muted-foreground">
              {formatPrice(item.price, item.currency, locale)}
            </span>
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

      {assignEnabled &&
        onAssign &&
        assignMembers &&
        currentUserId &&
        (() => {
          const members = assignMembers;
          const userId = currentUserId;
          const assign = onAssign;
          const label = assignee
            ? assignee.id === userId
              ? t("assignedToYou")
              : t("assignedTo", { name: assignee.name })
            : t("assignItem", { name: item.name });
          const chip = assignee ? (
            <MemberAvatar initials={assignee.initials} color={assignee.color} title={label} />
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground">
              <UserPlus className="size-3.5" aria-hidden />
            </span>
          );

          if (members.length > 2) {
            return (
              <DropdownMenu>
                <DropdownMenuTrigger render={<button type="button" aria-label={label} className="mt-0.5 shrink-0" />}>
                  {chip}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl">
                  <DropdownMenuLabel>{t("assignMenuLabel")}</DropdownMenuLabel>
                  {members.map((member) => (
                    <DropdownMenuItem key={member.id} onClick={() => assign(item, member.id)}>
                      <MemberAvatar
                        initials={member.initials}
                        color={member.color}
                        title={member.name}
                        className="size-5 text-[10px]"
                      />
                      {member.name}
                    </DropdownMenuItem>
                  ))}
                  {assignee && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => assign(item, null)}>{t("unassign")}</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }

          return (
            <button
              type="button"
              aria-label={label}
              className="mt-0.5 shrink-0"
              onClick={() =>
                assign(
                  item,
                  nextAssignee(
                    item.assigned_to,
                    userId,
                    members.map((member) => member.id),
                  ),
                )
              }
            >
              {chip}
            </button>
          );
        })()}

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
