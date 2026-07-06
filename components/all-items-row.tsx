"use client";

import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ItemWithList } from "@/lib/types";
import { getListTypeMeta, isWishlist } from "@/lib/list-types";
import type { MemberColor } from "@/lib/member-colors";
import { UNKNOWN_MEMBER_COLOR } from "@/lib/member-colors";
import {
  canSeeReservation,
  isPurchased,
  isReserved,
} from "@/lib/wishlist-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AllItemsRowProps = {
  item: ItemWithList;
  currentUserId: string;
  adderColor: MemberColor;
  checkerColor: MemberColor | null;
  imageUrl: string | null;
  hasImages: boolean;
  onToggle: (item: ItemWithList) => void;
  onOpenDetail: (item: ItemWithList) => void;
  onReserve: (item: ItemWithList) => void;
  onRelease: (item: ItemWithList) => void;
  onMarkPurchased: (item: ItemWithList) => void;
  onUnmarkPurchased: (item: ItemWithList) => void;
};

export function AllItemsRow({
  item,
  currentUserId,
  adderColor,
  checkerColor,
  imageUrl,
  hasImages,
  onToggle,
  onOpenDetail,
  onReserve,
  onRelease,
  onMarkPurchased,
  onUnmarkPurchased,
}: AllItemsRowProps) {
  const tItems = useTranslations("items");
  const tWishlist = useTranslations("wishlist");
  const tListTypes = useTranslations("listTypes");

  const list = item.lists;
  const listMeta = getListTypeMeta(list.type, (key) => tListTypes(key));
  const wishlist = isWishlist(list.type);
  const checked = item.checked_at !== null;
  const purchased = isPurchased(item);
  const reserved = isReserved(item);
  const showReservation = canSeeReservation(item, currentUserId, list.owner_id);
  const isReserver = item.reserved_by === currentUserId;
  const canReserve = wishlist && !purchased && !reserved && currentUserId !== list.owner_id;
  const canRelease = wishlist && !purchased && reserved && isReserver;
  const canMarkPurchased = wishlist && !purchased && reserved && isReserver;
  const canUnmarkPurchased = wishlist && purchased && item.checked_by === currentUserId;
  const completerColor = checked && item.checked_by ? checkerColor ?? UNKNOWN_MEMBER_COLOR : null;

  return (
    <li
      className="animate-item-in motion-reduce:animate-none rounded-2xl border border-border bg-card"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: adderColor.color,
        backgroundColor: completerColor ? completerColor.tint : undefined,
      }}
    >
      <span className="sr-only">{tItems("addedBy")}</span>
      {completerColor && <span className="sr-only">{tItems("completedBy")}</span>}
      <div className="flex items-start gap-2 p-3">
        <div className="flex shrink-0 flex-col items-center gap-1 pt-1">
          {wishlist ? (
            <>
              {canReserve ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-lg px-2 text-xs"
                  onClick={() => onReserve(item)}
                >
                  {tWishlist("reserve")}
                </Button>
              ) : canMarkPurchased ? (
                <button
                  type="button"
                  aria-label={tWishlist("markPurchasedItem", { name: item.name })}
                  className="flex size-8 items-center justify-center rounded-full border border-input transition-colors hover:border-primary"
                  onClick={() => onMarkPurchased(item)}
                >
                  <Check className="size-4 text-muted-foreground" aria-hidden />
                </button>
              ) : purchased && canUnmarkPurchased ? (
                <button
                  type="button"
                  aria-label={tWishlist("unmarkPurchasedItem", { name: item.name })}
                  className="flex size-8 animate-check-pop motion-reduce:animate-none items-center justify-center rounded-full border border-transparent bg-primary text-primary-foreground"
                  onClick={() => onUnmarkPurchased(item)}
                >
                  <Check className="size-4" aria-hidden />
                </button>
              ) : (
                <span className="size-8 shrink-0" aria-hidden />
              )}
              {canRelease ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={() => onRelease(item)}
                >
                  {tWishlist("release")}
                </button>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              aria-label={
                checked
                  ? tItems("uncheckItem", { name: item.name })
                  : tItems("checkItem", { name: item.name })
              }
              className={cn(
                "flex size-8 items-center justify-center rounded-full border transition-colors",
                checked
                  ? "border-transparent text-primary-foreground animate-check-pop motion-reduce:animate-none"
                  : "border-input",
              )}
              style={checked ? { backgroundColor: (completerColor ?? UNKNOWN_MEMBER_COLOR).color } : undefined}
              onClick={() => onToggle(item)}
            >
              {checked && <Check className="size-4" />}
            </button>
          )}
        </div>

        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          onClick={() => onOpenDetail(item)}
        >
          {wishlist && imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={tItems("photoAlt", { name: item.name })}
              className="size-12 shrink-0 rounded-lg object-cover"
            />
          ) : null}

          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "font-medium text-foreground",
                (checked || purchased) && "line-through",
              )}
            >
              {item.name}
            </p>

            <Link
              href={`/lists/${list.id}`}
              onClick={(event) => event.stopPropagation()}
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <span aria-hidden>{listMeta.icon}</span>
              <span className="font-medium">{list.name}</span>
              <span aria-hidden>·</span>
              <span>{listMeta.label}</span>
            </Link>

            {wishlist && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {item.priority === "must_have" && (
                  <Badge variant="secondary">{tWishlist("priorityMustHave")}</Badge>
                )}
                {purchased && (
                  <Badge>
                    {currentUserId === list.owner_id
                      ? tWishlist("obtained")
                      : tWishlist("purchased")}
                  </Badge>
                )}
                {!purchased && showReservation && reserved && (
                  <Badge variant="secondary">
                    {isReserver ? tWishlist("reservedByYou") : tWishlist("reserved")}
                  </Badge>
                )}
                {hasImages && !imageUrl && (
                  <Badge variant="outline">{tWishlist("hasPhotos")}</Badge>
                )}
              </div>
            )}

            {item.note && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.note}</p>
            )}
          </div>
        </button>

        <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
    </li>
  );
}
