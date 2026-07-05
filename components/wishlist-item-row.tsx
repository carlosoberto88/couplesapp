"use client";

import { ExternalLink, X } from "lucide-react";
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
  imageUrl: string | null;
  onReserve: (item: Item) => void;
  onRelease: (item: Item) => void;
  onMarkPurchased: (item: Item) => void;
  onUnmarkPurchased: (item: Item) => void;
  onRemove: (item: Item) => void;
};

export function WishlistItemRow({
  item,
  listOwnerId,
  currentUserId,
  adderColor,
  imageUrl,
  onReserve,
  onRelease,
  onMarkPurchased,
  onUnmarkPurchased,
  onRemove,
}: WishlistItemRowProps) {
  const t = useTranslations("wishlist");
  const purchased = isPurchased(item);
  const reserved = isReserved(item);
  const showReservation = canSeeReservation(item, currentUserId, listOwnerId);
  const isReserver = item.reserved_by === currentUserId;
  const canReserve = !purchased && !reserved && currentUserId !== listOwnerId;
  const canRelease = reserved && isReserver;
  const canMarkPurchased = reserved && isReserver && !purchased;
  const canUnmarkPurchased = purchased && item.checked_by === currentUserId;

  return (
    <li
      className={cn(
        "animate-item-in flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 transition-opacity",
        purchased && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="size-16 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted text-xl">
            🎁
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start gap-2">
            <span
              aria-hidden
              title={t("descriptionLabel")}
              className="mt-1.5 size-2 shrink-0 rounded-full"
              style={{ backgroundColor: adderColor.color }}
            />
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium text-foreground", purchased && "line-through")}>
                {item.name}
              </p>
              {item.note && (
                <p className="mt-0.5 text-sm text-muted-foreground">{item.note}</p>
              )}
              {item.price !== null && (
                <p className="mt-0.5 text-sm font-medium text-foreground">
                  {item.currency ?? "USD"} {item.price.toFixed(2)}
                </p>
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

          <div className="flex flex-wrap items-center gap-1.5 pl-4">
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
            {purchased && isReserver && (
              <Badge variant="secondary">{t("purchasedByYou")}</Badge>
            )}
          </div>

          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1 pl-4 text-sm text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {t("openLink")}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pl-1">
        {canReserve && (
          <Button type="button" size="sm" variant="secondary" onClick={() => onReserve(item)}>
            {t("reserve")}
          </Button>
        )}
        {canRelease && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onRelease(item)}>
            {t("release")}
          </Button>
        )}
        {canMarkPurchased && (
          <Button type="button" size="sm" onClick={() => onMarkPurchased(item)}>
            {t("markPurchased")}
          </Button>
        )}
        {canUnmarkPurchased && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onUnmarkPurchased(item)}>
            {t("unmarkPurchased")}
          </Button>
        )}
      </div>
    </li>
  );
}