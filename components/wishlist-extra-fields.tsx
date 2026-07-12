"use client";

import { useTranslations } from "next-intl";

import type { ItemPriority } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type WishlistExtraFieldsProps = {
  price: string;
  priority: ItemPriority | null;
  pending?: boolean;
  compact?: boolean;
  showPrice?: boolean;
  showPriority?: boolean;
  onPriceChange: (price: string) => void;
  onPriorityChange: (priority: ItemPriority | null) => void;
};

export function WishlistExtraFields({
  price,
  priority,
  pending = false,
  compact = false,
  showPrice = true,
  showPriority = true,
  onPriceChange,
  onPriorityChange,
}: WishlistExtraFieldsProps) {
  const tWishlist = useTranslations("wishlist");

  return (
    <>
      {showPrice ? (
        <Input
          className={cn("rounded-xl", compact ? "h-10" : "h-11")}
          type="number"
          min="0"
          step="0.01"
          placeholder={tWishlist("pricePlaceholder")}
          value={price}
          onChange={(e) => onPriceChange(e.target.value)}
          disabled={pending}
        />
      ) : null}
      {showPriority ? (
        <div className="flex flex-col gap-1.5">
          <Label>{tWishlist("priorityLabel")}</Label>
          <div className="flex gap-2">
            {(["must_have", "nice_to_have"] as const).map((key) => (
              <button
                key={key}
                type="button"
                disabled={pending}
                aria-pressed={priority === key}
                onClick={() => onPriorityChange(priority === key ? null : key)}
                className={cn(
                  "flex-1 rounded-xl border-2 px-3 py-2 text-xs font-medium transition-colors",
                  priority === key
                    ? "border-primary bg-duo-coral-tint text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {key === "must_have" ? tWishlist("priorityMustHave") : tWishlist("priorityNiceToHave")}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
