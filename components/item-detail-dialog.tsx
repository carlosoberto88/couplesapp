"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, ImagePlus, Pencil } from "lucide-react";
import { Switch } from "@base-ui/react/switch";
import { toast } from "sonner";

import type { Item, ItemImage, ItemPriority } from "@/lib/types";
import type { MemberColor } from "@/lib/member-colors";
import { getListTypeConfig, isWishlist } from "@/lib/list-types";
import { buildEditPatch, type ItemUpdatePatch } from "@/lib/item-mutations";
import {
  canSeeReservation,
  isPurchased,
  isReserved,
} from "@/lib/wishlist-utils";
import {
  deleteSingleItemImage,
  MAX_IMAGES_PER_ITEM,
  uploadItemImages,
  validateImageFile,
} from "@/lib/upload-item-image";
import { useSupabaseClient } from "@/lib/supabase/client";
import { ItemOptionalFields } from "@/components/item-optional-fields";
import { WishlistExtraFields } from "@/components/wishlist-extra-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  listRecurring?: boolean;
  imageUrls: string[];
  imageCount: number;
  existingImages?: ItemImage[];
  adderName: string | null;
  checkerColor: MemberColor | null;
  onToggle?: (item: Item) => void;
  onRemove?: (item: Item) => void;
  onReserve?: (item: Item) => void;
  onRelease?: (item: Item) => void;
  onMarkPurchased?: (item: Item) => void;
  onUnmarkPurchased?: (item: Item) => void;
  onSave?: (item: Item, patch: ItemUpdatePatch) => void;
  onPhotosAdded?: () => void;
  onImageRemoved?: () => void;
};

function initEditForm(source: Item) {
  return {
    name: source.name,
    url: source.url ?? "",
    note: source.note ?? "",
    price: source.price !== null ? source.price.toFixed(2) : "",
    priority: source.priority,
    aisle: source.aisle ?? "",
  };
}

export function ItemDetailDialog({
  item,
  open,
  onOpenChange,
  listId,
  listType,
  listOwnerId,
  currentUserId,
  listRecurring = false,
  imageUrls,
  imageCount,
  existingImages = [],
  adderName,
  checkerColor,
  onToggle,
  onRemove,
  onReserve,
  onRelease,
  onMarkPurchased,
  onUnmarkPurchased,
  onSave,
  onPhotosAdded,
  onImageRemoved,
}: ItemDetailDialogProps) {
  const t = useTranslations("itemDetail");
  const tWishlist = useTranslations("wishlist");
  const tItems = useTranslations("items");
  const supabase = useSupabaseClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");
  const [priority, setPriority] = useState<ItemPriority | null>(null);
  const [aisle, setAisle] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [removedImageIds, setRemovedImageIds] = useState<Set<string>>(() => new Set());

  const resetEditForm = useCallback((source: Item) => {
    const form = initEditForm(source);
    setName(form.name);
    setUrl(form.url);
    setNote(form.note);
    setPrice(form.price);
    setPriority(form.priority);
    setAisle(form.aisle);
    setNewFiles([]);
    setFileError(null);
    setRemovedImageIds(new Set());
  }, []);

  if (!item) return null;

  const currentItem = item;
  const editing = editingItemId === currentItem.id;

  const wishlist = isWishlist(listType);
  const showAisle = getListTypeConfig(listType).supportsAisles;
  const checked = currentItem.checked_at !== null;
  const purchased = isPurchased(currentItem);
  const reserved = isReserved(currentItem);
  const showReservation = canSeeReservation(currentItem, currentUserId, listOwnerId);
  const isReserver = currentItem.reserved_by === currentUserId;
  const canReserve = wishlist && !purchased && !reserved && currentUserId !== listOwnerId;
  const canRelease = wishlist && reserved && isReserver;
  const canMarkPurchased = wishlist && reserved && isReserver && !purchased;
  const canUnmarkPurchased = wishlist && purchased && currentItem.checked_by === currentUserId;
  const canAddPhotos = imageCount < MAX_IMAGES_PER_ITEM;
  const canEdit = !!onSave;

  const remainingExistingCount = existingImages.filter((img) => !removedImageIds.has(img.id)).length;
  const editImageCount = remainingExistingCount + newFiles.length;
  const canAddMoreInEdit = editImageCount < MAX_IMAGES_PER_ITEM;

  const visibleExistingImages = existingImages
    .map((img, index) => ({ img, url: imageUrls[index] }))
    .filter(({ img, url }) => !removedImageIds.has(img.id) && !!url);

  function enterEditMode() {
    resetEditForm(currentItem);
    setEditingItemId(currentItem.id);
  }

  function cancelEdit() {
    resetEditForm(currentItem);
    setEditingItemId(null);
  }

  function handleDialogOpenChange(next: boolean) {
    if (!next) setEditingItemId(null);
    onOpenChange(next);
  }

  async function handlePhotosSelected(selected: FileList | null) {
    if (!selected?.length) return;
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

    const { error } = await uploadItemImages(supabase, listId, currentItem.id, currentUserId, files);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (error) {
      setUploadError(error);
      return;
    }

    onPhotosAdded?.();
  }

  async function handleSave() {
    if (!onSave || saving) return;

    const trimmedName = name.trim();
    if (!trimmedName) return;

    const parsedPrice = price.trim() ? Number.parseFloat(price.trim()) : null;
    const editInput = {
      name: trimmedName,
      url: url.trim() || null,
      note: note.trim() || null,
      price: wishlist && parsedPrice !== null && !Number.isNaN(parsedPrice) ? parsedPrice : null,
      currency: "USD" as const,
      priority: wishlist ? priority : null,
      files: newFiles,
    };
    const patch = buildEditPatch(editInput, wishlist);
    if (showAisle) {
      patch.aisle = aisle.trim() || null;
    }

    setSaving(true);

    onSave(currentItem, patch);

    const imagesToRemove = existingImages.filter((img) => removedImageIds.has(img.id));
    let photoError: string | undefined;

    for (const image of imagesToRemove) {
      const { error } = await deleteSingleItemImage(supabase, image);
      if (error) {
        photoError = error;
        break;
      }
    }

    if (!photoError && newFiles.length > 0) {
      const { error } = await uploadItemImages(
        supabase,
        listId,
        currentItem.id,
        currentUserId,
        newFiles.slice(0, MAX_IMAGES_PER_ITEM - remainingExistingCount),
      );
      if (error) photoError = error;
    }

    setSaving(false);

    if (photoError) {
      toast.error(
        photoError === "invalidType"
          ? tItems("imageInvalidType")
          : photoError === "tooLarge"
            ? tItems("imageTooLarge")
            : tItems("uploadError"),
      );
      if (imagesToRemove.length > 0 || newFiles.length > 0) {
        onImageRemoved?.();
      }
      return;
    }

    if (imagesToRemove.length > 0 || newFiles.length > 0) {
      onImageRemoved?.();
    }

    toast.success(t("saved"));
    setEditingItemId(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          {editing ? (
            <DialogTitle className="font-display text-lg pr-8">{t("editTitle")}</DialogTitle>
          ) : (
            <DialogTitle className={cn("font-display text-lg pr-8", checked && "line-through opacity-70")}>
              {currentItem.name}
            </DialogTitle>
          )}
        </DialogHeader>

        {editing ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <Input
              className="h-11 rounded-xl"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={wishlist ? tWishlist("namePlaceholder") : tItems("addPlaceholder")}
              required
              disabled={saving}
              aria-label={tItems("addAriaLabel")}
            />

            <ItemOptionalFields
              url={url}
              note={note}
              files={newFiles}
              fileError={fileError}
              pending={saving}
              fileInputRef={editFileInputRef}
              onUrlChange={setUrl}
              onNoteChange={setNote}
              onFilesChange={setNewFiles}
              onFileErrorChange={setFileError}
            />

            {showAisle && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="item-aisle" className="text-xs font-medium text-muted-foreground">
                  {t("aisle")}
                </label>
                <Input
                  id="item-aisle"
                  className="h-11 rounded-xl"
                  value={aisle}
                  onChange={(e) => setAisle(e.target.value)}
                  placeholder={tItems("aislePlaceholder")}
                  maxLength={24}
                  disabled={saving}
                />
              </div>
            )}

            {wishlist ? (
              <WishlistExtraFields
                price={price}
                priority={priority}
                pending={saving}
                onPriceChange={setPrice}
                onPriorityChange={setPriority}
              />
            ) : null}

            {(visibleExistingImages.length > 0 || newFiles.length > 0) && (
              <ul className="flex flex-wrap gap-2">
                {visibleExistingImages.map(({ img, url: imgUrl }) => (
                  <li key={img.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgUrl} alt="" className="size-16 rounded-lg object-cover" />
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white"
                      disabled={saving}
                      onClick={() =>
                        setRemovedImageIds((prev) => new Set([...prev, img.id]))
                      }
                      aria-label={tItems("removePhoto")}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {canAddMoreInEdit && (
              <div>
                <input
                  ref={editFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files;
                    if (!selected?.length) return;
                    setFileError(null);
                    const next: File[] = [];
                    for (const file of Array.from(selected)) {
                      if (editImageCount + next.length >= MAX_IMAGES_PER_ITEM) break;
                      const err = validateImageFile(file);
                      if (err) {
                        setFileError(err);
                        continue;
                      }
                      next.push(file);
                    }
                    setNewFiles((prev) => [...prev, ...next].slice(0, MAX_IMAGES_PER_ITEM - remainingExistingCount));
                    if (editFileInputRef.current) editFileInputRef.current.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-xl"
                  disabled={saving || !canAddMoreInEdit}
                  onClick={() => editFileInputRef.current?.click()}
                >
                  <ImagePlus className="size-4" aria-hidden />
                  {tItems("addPhotos")}
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? tItems("adding") : t("save")}
              </Button>
              <Button type="button" variant="ghost" disabled={saving} onClick={cancelEdit}>
                {t("cancel")}
              </Button>
              {onRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={saving}
                  onClick={() => {
                    onRemove(currentItem);
                    onOpenChange(false);
                  }}
                >
                  {wishlist ? tWishlist("removeGift", { name: currentItem.name }) : tItems("removeItem", { name: currentItem.name })}
                </Button>
              )}
            </div>
          </form>
        ) : (
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
              {currentItem.note && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">{t("description")}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{currentItem.note}</dd>
                </div>
              )}

              {currentItem.url && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">{t("link")}</dt>
                  <dd className="mt-0.5">
                    <a
                      href={currentItem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {currentItem.url}
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                    </a>
                  </dd>
                </div>
              )}

              {wishlist && currentItem.price !== null && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">{t("price")}</dt>
                  <dd className="mt-0.5 font-medium">
                    {currentItem.currency ?? "USD"} {currentItem.price.toFixed(2)}
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

            {listRecurring && onSave && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">{t("justThisTrip")}</span>
                  <span className="text-xs text-muted-foreground">{t("justThisTripHint")}</span>
                </div>
                <Switch.Root
                  checked={currentItem.is_extra}
                  onCheckedChange={(checked) => onSave(currentItem, { is_extra: checked })}
                  className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-input transition-colors data-[checked]:bg-primary"
                >
                  <Switch.Thumb className="block size-4 translate-x-1 rounded-full bg-background shadow transition-transform data-[checked]:translate-x-5" />
                </Switch.Root>
              </div>
            )}

            {wishlist && (
              <div className="flex flex-wrap gap-1.5">
                {currentItem.priority === "must_have" && (
                  <Badge variant="secondary">{tWishlist("priorityMustHave")}</Badge>
                )}
                {currentItem.priority === "nice_to_have" && (
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
              {canEdit && (
                <Button type="button" variant="secondary" onClick={enterEditMode}>
                  <Pencil className="size-4" aria-hidden />
                  {t("edit")}
                </Button>
              )}
              {!wishlist && onToggle && (
                <Button type="button" variant="secondary" onClick={() => onToggle(currentItem)}>
                  {checked ? t("uncheck") : t("checkOff")}
                </Button>
              )}
              {canReserve && onReserve && (
                <Button type="button" variant="secondary" onClick={() => onReserve(currentItem)}>
                  {tWishlist("reserve")}
                </Button>
              )}
              {canRelease && onRelease && (
                <Button type="button" variant="ghost" onClick={() => onRelease(currentItem)}>
                  {tWishlist("release")}
                </Button>
              )}
              {canMarkPurchased && onMarkPurchased && (
                <Button type="button" onClick={() => onMarkPurchased(currentItem)}>
                  {tWishlist("markPurchased")}
                </Button>
              )}
              {canUnmarkPurchased && onUnmarkPurchased && (
                <Button type="button" variant="ghost" onClick={() => onUnmarkPurchased(currentItem)}>
                  {tWishlist("unmarkPurchased")}
                </Button>
              )}
              {onRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    onRemove(currentItem);
                    onOpenChange(false);
                  }}
                >
                  {wishlist ? tWishlist("removeGift", { name: currentItem.name }) : tItems("removeItem", { name: currentItem.name })}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
