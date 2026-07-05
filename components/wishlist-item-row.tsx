"use client";

import { ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Item } from "@/lib/types";
import type { MemberColor } from "@/lib/member-colors";
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
  imageUrl: string | null;
  hasImages: boolean;
  onOpenDetail: (item: Item) => void;
  onRemove: (item: Item) => void;
};

export function WishlistItemRow({
  item,
  listOwnerId,
  currentUserId,
  adderColor,
  imageUrl,
  hasImages,
  onOpenDetail,
  onRemove,
}: WishlistItemRowProps) {
  const t = useTranslations("wishlist");
  const purchased = isPurchased(item);
  const reserved = isReserved(item);
  const showReservation = canSeeReservation(item, currentUserId, listOwnerId);
  const isReserver = item.reserved_by === currentUserId;

  return (
    <li
      className={cn(
        "animate-item-in rounded-2xl border border-border bg-card transition-opacity",
        purchased && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          onClick={() => onOpenDetail(item)}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted text-xl">
              🎁
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1.5 size-2 shrink-0 rounded-full"
                style={{ backgroundColor: adderColor.color }}
              />
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium text-foreground", purchased && "line-through")}>
                  {item.name}
                </p>
                {item.note && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.note}</p>
                )}
                {item.price !== null && (
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    {item.currency ?? "USD"} {item.price.toFixed(2)}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-4">
              {item.priority === "must_have" && (
                <Badge variant="secondary">{t("priorityMustHave")}</Badge>
              )}
              {item.priority === "nice_to_have" && (
                <Badge variant="outline">{t("priorityNiceToHave")}</Badge>
              )}
              {purchased && (
                <Badge>{currentUserId === listOwnerId ? t("obtained") : t("purchased")}</Badge>
              )}
              {!purchased && showReservation && reserved && (
                <Badge variant="secondary">
                  {isReserver ? t("reservedByYou") : t("reserved")}
                </Badge>
              )}
              {hasImages && !imageUrl && (
                <Badge variant="outline">{t("hasPhotos")}</Badge>
              )}
            </div>

            <p className="mt-2 pl-4 text-xs text-primary">{t("viewDetails")}</p>
          </div>
        </button>

        <div className="flex shrink-0 flex-col gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label={t("removeGift", { name: item.name })}
            onClick={() => onRemove(item)}
          >
            <X className="size-4" />
          </Button>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </div>
      </div>
    </li>
  );
}
