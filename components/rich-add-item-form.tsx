"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlignLeft, ImagePlus, Link2 } from "lucide-react";

import type { ItemPriority } from "@/lib/types";
import { isWishlist } from "@/lib/list-types";
import { fetchLinkPreview, fetchPreviewImageAsFile } from "@/lib/persist-item";
import { safeExternalUrl } from "@/lib/safe-url";
import { MAX_IMAGES_PER_ITEM, validateImageFile } from "@/lib/upload-item-image";
import { ItemDetailsToggle } from "@/components/item-details-toggle";
import {
  ItemOptionalFields,
  type OptionalFieldKey,
} from "@/components/item-optional-fields";
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
  listId: string;
  listType: string;
  onAdd: (input: RichAddInput) => void;
  onAddMany?: (names: string[]) => void | Promise<void>;
  pending?: boolean;
  variant?: "default" | "sticky";
  initialUrl?: string | null;
  autoExpandDetails?: boolean;
};

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/.+/i.test(value.trim());
}

// Splits pasted/typed text on newlines and commas into distinct item names,
// trimming whitespace and de-duping case-insensitively while keeping the
// first-seen casing and order.
function splitMultipleNames(raw: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of raw.split(/[\n,]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(trimmed);
  }
  return names;
}

type StickyOptionalField = OptionalFieldKey | null;

function StickyOptionalChips({
  activeField,
  hasPhotos,
  pending,
  onToggleField,
  onPhotoClick,
}: {
  activeField: StickyOptionalField;
  hasPhotos: boolean;
  pending?: boolean;
  onToggleField: (field: "url" | "note") => void;
  onPhotoClick: () => void;
}) {
  const tItems = useTranslations("items");

  const chipClass = (field: StickyOptionalField, match: OptionalFieldKey) =>
    cn(
      "flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
      activeField === match || (match === "photo" && hasPhotos)
        ? "bg-muted text-foreground"
        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
    );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className={chipClass(activeField, "url")}
        disabled={pending}
        onClick={() => onToggleField("url")}
      >
        <Link2 className="size-3.5" aria-hidden />
        {tItems("addLink")}
      </button>
      <button
        type="button"
        className={chipClass(activeField, "note")}
        disabled={pending}
        onClick={() => onToggleField("note")}
      >
        <AlignLeft className="size-3.5" aria-hidden />
        {tItems("addNote")}
      </button>
      <button
        type="button"
        className={chipClass(activeField, "photo")}
        disabled={pending}
        onClick={onPhotoClick}
      >
        <ImagePlus className="size-3.5" aria-hidden />
        {tItems("addPhoto")}
      </button>
    </div>
  );
}

export function RichAddItemForm({
  listId,
  listType,
  onAdd,
  onAddMany,
  pending = false,
  variant = "default",
  initialUrl = null,
  autoExpandDetails = false,
}: RichAddItemFormProps) {
  const tItems = useTranslations("items");
  const tWishlist = useTranslations("wishlist");
  const wishlist = isWishlist(listType);
  const sticky = variant === "sticky";

  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [expanded, setExpanded] = useState(autoExpandDetails);
  const [activeField, setActiveField] = useState<StickyOptionalField>(
    autoExpandDetails ? "url" : null,
  );
  const [url, setUrl] = useState(initialUrl ?? "");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");
  const [priority, setPriority] = useState<ItemPriority | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichFailed, setEnrichFailed] = useState(false);
  const lastEnrichedUrlRef = useRef<string | null>(null);
  const enrichRequestIdRef = useRef(0);

  function reset() {
    setName("");
    setUrl("");
    setNote("");
    setPrice("");
    setPriority(null);
    setFiles([]);
    setFileError(null);
    setExpanded(false);
    setActiveField(null);
    setEnriching(false);
    setEnrichFailed(false);
    lastEnrichedUrlRef.current = null;
    enrichRequestIdRef.current += 1;
    nameInputRef.current?.focus();
  }

  function handleUrlChange(nextUrl: string) {
    setUrl(nextUrl);
    if (nextUrl.trim() !== lastEnrichedUrlRef.current) setEnrichFailed(false);
  }

  async function handleUrlCommit(candidate: string) {
    const trimmed = candidate.trim();
    if (!looksLikeUrl(trimmed) || trimmed === lastEnrichedUrlRef.current) return;
    lastEnrichedUrlRef.current = trimmed;

    const requestId = ++enrichRequestIdRef.current;
    setEnriching(true);
    setEnrichFailed(false);

    const { preview, error } = await fetchLinkPreview(listId, trimmed);
    if (requestId !== enrichRequestIdRef.current) return;
    setEnriching(false);

    if (error || !preview) {
      setEnrichFailed(true);
      return;
    }

    setName((current) => (current.trim() ? current : preview.name));
    if (wishlist && preview.price !== null) {
      setPrice((current) => (current.trim() ? current : String(preview.price)));
    }

    if (preview.imageUrl) {
      const imageFile = await fetchPreviewImageAsFile(preview.imageUrl);
      if (requestId !== enrichRequestIdRef.current) return;
      if (imageFile && !validateImageFile(imageFile)) {
        setFiles((current) => (current.length > 0 ? current : [imageFile]));
      }
    }
  }

  function toggleStickyField(field: "url" | "note") {
    setActiveField((current) => (current === field ? null : field));
  }

  function handlePhotoChipClick() {
    setActiveField("photo");
    fileInputRef.current?.click();
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
    setFiles([...files, ...next].slice(0, MAX_IMAGES_PER_ITEM));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;

    const names = splitMultipleNames(name);
    if (names.length === 0) return;

    if (names.length >= 2 && onAddMany) {
      void onAddMany(names);
      reset();
      return;
    }

    const trimmed = names[0];
    const parsedPrice = price.trim() ? Number.parseFloat(price.trim()) : null;

    onAdd({
      name: trimmed,
      url: safeExternalUrl(url.trim()),
      note: note.trim() || null,
      price: wishlist && parsedPrice !== null && !Number.isNaN(parsedPrice) ? parsedPrice : null,
      currency: "USD",
      priority: wishlist ? priority : null,
      files,
    });
    reset();
  }

  const stickyVisibleFields: OptionalFieldKey[] = [];
  if (activeField === "url") stickyVisibleFields.push("url");
  if (activeField === "note") stickyVisibleFields.push("note");
  if (activeField === "photo" || files.length > 0) stickyVisibleFields.push("photo");

  const showStickyOptionalPanel = sticky && stickyVisibleFields.length > 0;
  const showWishlistExtras =
    sticky && wishlist && (activeField === "url" || activeField === "note");

  return (
    <form
      className={cn(
        "flex flex-col gap-3",
        sticky ? "gap-2" : "rounded-2xl border border-border bg-card p-4",
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

      {onAddMany ? (
        <p className="text-xs text-muted-foreground">{tItems("multiAddHint")}</p>
      ) : null}

      {sticky ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              setActiveField("photo");
              handleFilesSelected(e.target.files);
            }}
          />
          <StickyOptionalChips
            activeField={activeField}
            hasPhotos={files.length > 0}
            pending={pending}
            onToggleField={toggleStickyField}
            onPhotoClick={handlePhotoChipClick}
          />
          {showStickyOptionalPanel ? (
            <ItemOptionalFields
              url={url}
              note={note}
              files={files}
              fileError={fileError}
              pending={pending}
              compact
              visibleFields={stickyVisibleFields}
              fileInputRef={fileInputRef}
              onUrlChange={handleUrlChange}
              onUrlCommit={(candidate) => void handleUrlCommit(candidate)}
              urlEnriching={enriching}
              urlEnrichFailed={enrichFailed}
              onNoteChange={setNote}
              onFilesChange={setFiles}
              onFileErrorChange={setFileError}
            />
          ) : null}
          {showWishlistExtras ? (
            <WishlistExtraFields
              price={price}
              priority={priority}
              pending={pending}
              compact
              onPriceChange={setPrice}
              onPriorityChange={setPriority}
            />
          ) : null}
        </>
      ) : (
        <>
          <ItemDetailsToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />

          {expanded && (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <ItemOptionalFields
                url={url}
                note={note}
                files={files}
                fileError={fileError}
                pending={pending}
                onUrlChange={handleUrlChange}
                onUrlCommit={(candidate) => void handleUrlCommit(candidate)}
                urlEnriching={enriching}
                urlEnrichFailed={enrichFailed}
                onNoteChange={setNote}
                onFilesChange={setFiles}
                onFileErrorChange={setFileError}
              />
              {wishlist ? (
                <WishlistExtraFields
                  price={price}
                  priority={priority}
                  pending={pending}
                  onPriceChange={setPrice}
                  onPriorityChange={setPriority}
                />
              ) : null}
            </div>
          )}
        </>
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
