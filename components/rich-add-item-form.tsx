"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ImagePlus } from "lucide-react";

import type { ItemPriority } from "@/lib/types";
import { isWishlist } from "@/lib/list-types";
import { MAX_IMAGES_PER_ITEM, validateImageFile } from "@/lib/upload-item-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type RichAddInput = {
  name: string;
  note: string | null;
  url: string | null;
  files: File[];
  price: number | null;
  currency: string;
  priority: ItemPriority | null;
};

type RichAddItemFormProps = {
  listType: string;
  onAdd: (input: RichAddInput) => void;
  pending?: boolean;
};

export function RichAddItemForm({ listType, onAdd, pending = false }: RichAddItemFormProps) {
  const tItems = useTranslations("items");
  const tWishlist = useTranslations("wishlist");
  const wishlist = isWishlist(listType);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [expanded, setExpanded] = useState(wishlist);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");
  const [priority, setPriority] = useState<ItemPriority | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  function reset() {
    setName("");
    setUrl("");
    setNote("");
    setPrice("");
    setPriority(null);
    setFiles([]);
    setFileError(null);
    if (!wishlist) setExpanded(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    nameInputRef.current?.focus();
  }

  function handleFilesSelected(selected: FileList | null) {
    if (!selected?.length) return;
    setFileError(null);
    const next: File[] = [];
    for (const file of Array.from(selected)) {
      if (files.length + next.length >= MAX_IMAGES_PER_ITEM) break;
      const err = validateImageFile(file);
      if (err) {
        setFileError(err);
        continue;
      }
      next.push(file);
    }
    setFiles((prev) => [...prev, ...next].slice(0, MAX_IMAGES_PER_ITEM));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;

    const parsedPrice = price.trim() ? Number.parseFloat(price.trim()) : null;

    onAdd({
      name: trimmed,
      url: url.trim() || null,
      note: note.trim() || null,
      price: wishlist && parsedPrice !== null && !Number.isNaN(parsedPrice) ? parsedPrice : null,
      currency: "USD",
      priority: wishlist ? priority : null,
      files,
    });
    reset();
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
      onSubmit={handleSubmit}
    >
      <Input
        ref={nameInputRef}
        className="h-11 rounded-xl"
        placeholder={wishlist ? tWishlist("namePlaceholder") : tItems("addPlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        disabled={pending}
        aria-label={tItems("addAriaLabel")}
      />

      {!wishlist && (
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown
            className={cn("size-4 transition-transform", expanded && "rotate-180")}
            aria-hidden
          />
          {tItems("optionalDetails")}
        </button>
      )}

      {(expanded || wishlist) && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <Input
            className="h-11 rounded-xl"
            type="url"
            placeholder={tItems("urlPlaceholder")}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={pending}
          />
          <textarea
            className="min-h-20 w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={tItems("descriptionPlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
          />

          {wishlist && (
            <>
              <Input
                className="h-11 rounded-xl"
                type="number"
                min="0"
                step="0.01"
                placeholder={tWishlist("pricePlaceholder")}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={pending}
              />
              <div className="flex flex-col gap-1.5">
                <Label>{tWishlist("priorityLabel")}</Label>
                <div className="flex gap-2">
                  {(["must_have", "nice_to_have"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={pending}
                      aria-pressed={priority === key}
                      onClick={() => setPriority(priority === key ? null : key)}
                      className={cn(
                        "flex-1 rounded-xl border-2 px-3 py-2 text-xs font-medium transition-colors",
                        priority === key
                          ? "border-primary bg-duo-coral-tint text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {key === "must_have"
                        ? tWishlist("priorityMustHave")
                        : tWishlist("priorityNiceToHave")}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>{tItems("photosLabel")}</Label>
            <p className="text-xs text-muted-foreground">
              {tItems("photosHint", { max: MAX_IMAGES_PER_ITEM, sizeMb: 5 })}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-fit rounded-xl"
              disabled={pending || files.length >= MAX_IMAGES_PER_ITEM}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="size-4" aria-hidden />
              {tItems("addPhotos")}
            </Button>
            {fileError && (
              <p className="text-xs text-destructive">
                {fileError === "invalidType" ? tItems("imageInvalidType") : tItems("imageTooLarge")}
              </p>
            )}
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(file)}
                      alt=""
                      className="size-16 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      aria-label={tItems("removePhoto")}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Button type="submit" className="h-11 rounded-xl" disabled={pending || !name.trim()}>
        {pending
          ? wishlist
            ? tWishlist("adding")
            : tItems("adding")
          : wishlist
            ? tWishlist("submit")
            : tItems("addSubmit")}
      </Button>
    </form>
  );
}
