"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, ImagePlus } from "lucide-react";

import type { Item } from "@/lib/types";
import type { MemberColor } from "@/lib/member-colors";
import { isWishlist } from "@/lib/list-types";
import {
  canSeeReservation,
  isPurchased,
  isReserved,
} from "@/lib/wishlist-utils";
import {
  MAX_IMAGES_PER_ITEM,
  uploadItemImages,
  validateImageFile,
} from "@/lib/upload-item-image";
import { useSupabaseClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ItemDetailDialogProps = {
  item: Item | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  listType: string;
  listOwnerId: string;
  currentUserId: string;
  imageUrls: string[];
  imageCount: number;
  adderName: string | null;
  checkerColor: MemberColor | null;
  onToggle?: (item: Item) => void;
  onRemove?: (item: Item) => void;
  onReserve?: (item: Item) => void;
  onRelease?: (item: Item) => void;
  onMarkPurchased?: (item: Item) => void;
  onUnmarkPurchased?: (item: Item) => void;
  onPhotosAdded?: () => void;
};

export function ItemDetailDialog({
  item,
  open,
  onOpenChange,
  listId,
  listType,
  listOwnerId,
  currentUserId,
  imageUrls,
  imageCount,
  adderName,
  checkerColor,
  onToggle,
  onRemove,
  onReserve,
  onRelease,
  onMarkPurchased,
  onUnmarkPurchased,
  onPhotosAdded,
}: ItemDetailDialogProps) {
  const t = useTranslations("itemDetail");
  const tWishlist = useTranslations("wishlist");
  const tItems = useTranslations("items");
  const supabase = useSupabaseClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!item) return null;

  const wishlist = isWishlist(listType);
  const checked = item.checked_at !== null;
  const purchased = isPurchased(item);
  const reserved = isReserved(item);
  const showReservation = canSeeReservation(item, currentUserId, listOwnerId);
  const isReserver = item.reserved_by === currentUserId;
  const canReserve = wishlist && !purchased && !reserved && currentUserId !== listOwnerId;
  const canRelease = wishlist && reserved && isReserver;
  const canMarkPurchased = wishlist && reserved && isReserver && !purchased;
  const canUnmarkPurchased = wishlist && purchased && item.checked_by === currentUserId;
  const canAddPhotos = imageCount < MAX_IMAGES_PER_ITEM;

  async function handlePhotosSelected(selected: FileList | null) {
    if (!selected?.length || !item) return;
    setUploadError(null);
    setUploading(true);

    const files: File[] = [];
    for (const file of Array.from(selected)) {
      if (imageCount + files.length >= MAX_IMAGES_PER_ITEM) break;
      const err = validateImageFile(file);
      if (err) {
        setUploadError(err);
        continue;
      }
      files.push(file);
    }

    if (files.length === 0) {
      setUploading(false);
      return;
    }

    const { error } = await uploadItemImages(supabase, listId, item.id, currentUserId, files);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (error) {
      setUploadError(error);
      return;
    }

    onPhotosAdded?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={cn("font-display text-lg pr-8", checked && "line-through opacity-70")}>
            {item.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {imageUrls.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {imageUrls.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt=""
                  className="size-32 shrink-0 rounded-xl object-cover"
                />
              ))}
            </div>
          ) : (
            <div className="flex size-32 items-center justify-center rounded-xl bg-muted text-3xl">
              {wishlist ? "🎁" : "📋"}
            </div>
          )}

          {canAddPhotos && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => void handlePhotosSelected(e.target.files)}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-xl"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="size-4" aria-hidden />
                {uploading ? tItems("adding") : tItems("addPhotos")}
              </Button>
              {uploadError && (
                <p className="mt-1 text-xs text-destructive">
                  {uploadError === "invalidType"
                    ? tItems("imageInvalidType")
                    : uploadError === "tooLarge"
                      ? tItems("imageTooLarge")
                      : tItems("uploadError")}
                </p>
              )}
            </div>
          )}

          <dl className="flex flex-col gap-3 text-sm">
            {item.note && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t("description")}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{item.note}</dd>
              </div>
            )}

            {item.url && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t("link")}</dt>
                <dd className="mt-0.5">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {item.url}
                    <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                  </a>
                </dd>
              </div>
            )}

            {wishlist && item.price !== null && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t("price")}</dt>
                <dd className="mt-0.5 font-medium">
                  {item.currency ?? "USD"} {item.price.toFixed(2)}
                </dd>
              </div>
            )}

            {adderName && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t("addedBy")}</dt>
                <dd className="mt-0.5">{adderName}</dd>
              </div>
            )}

            {!wishlist && checked && checkerColor && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t("status")}</dt>
                <dd className="mt-0.5 flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: checkerColor.color }}
                    aria-hidden
                  />
                  {t("checkedOff")}
                </dd>
              </div>
            )}
          </dl>

          {wishlist && (
            <div className="flex flex-wrap gap-1.5">
              {item.priority === "must_have" && (
                <Badge variant="secondary">{tWishlist("priorityMustHave")}</Badge>
              )}
              {item.priority === "nice_to_have" && (
                <Badge variant="outline">{tWishlist("priorityNiceToHave")}</Badge>
              )}
              {purchased && (
                <Badge>{currentUserId === listOwnerId ? tWishlist("obtained") : tWishlist("purchased")}</Badge>
              )}
              {!purchased && showReservation && reserved && (
                <Badge variant="secondary">
                  {isReserver ? tWishlist("reservedByYou") : tWishlist("reserved")}
                </Badge>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {!wishlist && onToggle && (
              <Button type="button" variant="secondary" onClick={() => onToggle(item)}>
                {checked ? t("uncheck") : t("checkOff")}
              </Button>
            )}
            {canReserve && onReserve && (
              <Button type="button" variant="secondary" onClick={() => onReserve(item)}>
                {tWishlist("reserve")}
              </Button>
            )}
            {canRelease && onRelease && (
              <Button type="button" variant="ghost" onClick={() => onRelease(item)}>
                {tWishlist("release")}
              </Button>
            )}
            {canMarkPurchased && onMarkPurchased && (
              <Button type="button" onClick={() => onMarkPurchased(item)}>
                {tWishlist("markPurchased")}
              </Button>
            )}
            {canUnmarkPurchased && onUnmarkPurchased && (
              <Button type="button" variant="ghost" onClick={() => onUnmarkPurchased(item)}>
                {tWishlist("unmarkPurchased")}
              </Button>
            )}
            {onRemove && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  onRemove(item);
                  onOpenChange(false);
                }}
              >
                {wishlist ? tWishlist("removeGift", { name: item.name }) : tItems("removeItem", { name: item.name })}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
