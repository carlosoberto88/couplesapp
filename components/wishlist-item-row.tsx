"use client";

import { Check, Star, X } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Item } from "@/lib/types";
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

type WishlistItemRowProps = {
  item: Item;
  listOwnerId: string;
  currentUserId: string;
  adderColor: MemberColor;
  checkerColor: MemberColor | null;
  imageUrl: string | null;
  hasImages: boolean;
  onOpenDetail: (item: Item) => void;
  onRemove: (item: Item) => void;
  onReserve: (item: Item) => void;
  onRelease: (item: Item) => void;
  onMarkPurchased: (item: Item) => void;
  onUnmarkPurchased: (item: Item) => void;
};

export function WishlistItemRow({
  item,
  listOwnerId,
  currentUserId,
  adderColor,
  checkerColor,
  imageUrl,
  hasImages,
  onOpenDetail,
  onRemove,
  onReserve,
  onRelease,
  onMarkPurchased,
  onUnmarkPurchased,
}: WishlistItemRowProps) {
  const t = useTranslations("wishlist");
  const purchased = isPurchased(item);
  const reserved = isReserved(item);
  const showReservation = canSeeReservation(item, currentUserId, listOwnerId);
  const isReserver = item.reserved_by === currentUserId;
  const canReserve = !purchased && !reserved && currentUserId !== listOwnerId;
  const canRelease = !purchased && reserved && isReserver;
  const canMarkPurchased = !purchased && reserved && isReserver;
  const canUnmarkPurchased = purchased && item.checked_by === currentUserId;
  const completerColor =
    purchased && item.checked_by ? checkerColor ?? UNKNOWN_MEMBER_COLOR : null;

  return (
    <li
      className={cn(
        "animate-item-in overflow-hidden rounded-2xl border border-border bg-card transition-opacity",
        purchased && "opacity-60",
      )}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: adderColor.color,
        backgroundColor: completerColor ? completerColor.tint : undefined,
      }}
    >
      <span className="sr-only">{t("addedBy")}</span>
      {completerColor && <span className="sr-only">{t("completedBy")}</span>}

      <button
        type="button"
        className="block w-full text-left"
        onClick={() => onOpenDetail(item)}
      >
        <div className="relative aspect-square w-full">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center bg-duo-coral-tint text-3xl">
              🎁
            </div>
          )}

          {item.priority === "must_have" && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-duo-coral bg-duo-coral-tint px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm">
              <Star className="size-3 fill-duo-coral text-duo-coral" aria-hidden />
              {t("priorityMustHave")}
            </span>
          )}

          {(purchased || (showReservation && reserved)) && (
            <div className="absolute inset-x-0 bottom-0 flex justify-start bg-gradient-to-t from-foreground/60 to-transparent p-2 pt-6">
              <Badge>
                {purchased
                  ? currentUserId === listOwnerId
                    ? t("obtained")
                    : t("purchased")
                  : isReserver
                    ? t("reservedByYou")
                    : t("reserved")}
              </Badge>
            </div>
          )}
        </div>

        <div className="p-2.5">
          <p
            className={cn(
              "line-clamp-2 font-medium text-foreground",
              purchased && "line-through",
            )}
          >
            {item.name}
          </p>
          {item.price !== null && (
            <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
              {item.currency ?? "USD"} {item.price.toFixed(2)}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {item.priority === "nice_to_have" && (
              <Badge variant="outline">{t("priorityNiceToHave")}</Badge>
            )}
            {hasImages && !imageUrl && <Badge variant="outline">{t("hasPhotos")}</Badge>}
          </div>
          <p className="mt-1.5 text-xs text-duo-coral">{t("viewDetails")}</p>
        </div>
      </button>

      <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {canReserve ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg border-duo-coral px-2 text-xs hover:bg-duo-coral-tint"
              onClick={() => onReserve(item)}
            >
              {t("reserve")}
            </Button>
          ) : canMarkPurchased ? (
            <button
              type="button"
              aria-label={t("markPurchasedItem", { name: item.name })}
              className="flex size-8 items-center justify-center rounded-full border border-input transition-colors hover:border-primary"
              onClick={() => onMarkPurchased(item)}
            >
              <Check className="size-4 text-muted-foreground" aria-hidden />
            </button>
          ) : purchased && canUnmarkPurchased ? (
            <button
              type="button"
              aria-label={t("unmarkPurchasedItem", { name: item.name })}
              className="flex size-8 animate-check-pop items-center justify-center rounded-full border border-transparent bg-primary text-primary-foreground"
              onClick={() => onUnmarkPurchased(item)}
            >
              <Check className="size-4" aria-hidden />
            </button>
          ) : null}

          {canRelease && (
            <button
              type="button"
              className="truncate text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => onRelease(item)}
            >
              {t("release")}
            </button>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={t("removeGift", { name: item.name })}
          onClick={() => onRemove(item)}
        >
          <X className="size-4" />
        </Button>
      </div>
    </li>
  );
}
