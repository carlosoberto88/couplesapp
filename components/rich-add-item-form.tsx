"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { ItemPriority } from "@/lib/types";
import { isWishlist } from "@/lib/list-types";
import { ItemDetailsToggle } from "@/components/item-details-toggle";
import { ItemOptionalFields } from "@/components/item-optional-fields";
import { WishlistExtraFields } from "@/components/wishlist-extra-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  variant?: "default" | "sticky";
};

export function RichAddItemForm({
  listType,
  onAdd,
  pending = false,
  variant = "default",
}: RichAddItemFormProps) {
  const tItems = useTranslations("items");
  const tWishlist = useTranslations("wishlist");
  const wishlist = isWishlist(listType);
  const sticky = variant === "sticky";

  const nameInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [expanded, setExpanded] = useState(false);
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
    setExpanded(false);
    nameInputRef.current?.focus();
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
      className={cn(
        "flex flex-col gap-3",
        sticky
          ? "gap-2"
          : "rounded-2xl border border-border bg-card p-4",
      )}
      onSubmit={handleSubmit}
    >
      <div className={cn("flex gap-2", sticky && "items-start")}>
        <Input
          ref={nameInputRef}
          className={cn("rounded-xl", sticky ? "h-11 flex-1" : "h-11")}
          placeholder={wishlist ? tWishlist("namePlaceholder") : tItems("addPlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={pending}
          aria-label={tItems("addAriaLabel")}
        />
        {sticky ? (
          <Button
            type="submit"
            className="h-11 shrink-0 rounded-xl bg-duo-teal px-4 text-white hover:bg-duo-teal/90"
            disabled={pending || !name.trim()}
          >
            {pending
              ? wishlist
                ? tWishlist("adding")
                : tItems("adding")
              : wishlist
                ? tWishlist("submit")
                : tItems("addSubmit")}
          </Button>
        ) : null}
      </div>

      <ItemDetailsToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />

      {expanded && (
        <div className={cn("flex flex-col gap-3", !sticky && "border-t border-border pt-3")}>
          <ItemOptionalFields
            url={url}
            note={note}
            files={files}
            fileError={fileError}
            pending={pending}
            compact={sticky}
            onUrlChange={setUrl}
            onNoteChange={setNote}
            onFilesChange={setFiles}
            onFileErrorChange={setFileError}
          />
          {wishlist ? (
            <WishlistExtraFields
              price={price}
              priority={priority}
              pending={pending}
              compact={sticky}
              onPriceChange={setPrice}
              onPriorityChange={setPriority}
            />
          ) : null}
        </div>
      )}

      {!sticky ? (
        <Button type="submit" className="h-11 rounded-xl" disabled={pending || !name.trim()}>
          {pending
            ? wishlist
              ? tWishlist("adding")
              : tItems("adding")
            : wishlist
              ? tWishlist("submit")
              : tItems("addSubmit")}
        </Button>
      ) : null}
    </form>
  );
}
