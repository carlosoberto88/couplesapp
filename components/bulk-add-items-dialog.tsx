"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ImagePlus, Plus, Trash2 } from "lucide-react";

import type { ItemPriority } from "@/lib/types";
import { isWishlist } from "@/lib/list-types";
import { MAX_IMAGES_PER_ITEM, validateImageFile } from "@/lib/upload-item-image";
import type { RichAddInput } from "@/components/rich-add-item-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type BulkRow = {
  id: string;
  name: string;
  note: string;
  url: string;
  price: string;
  priority: ItemPriority | null;
  files: File[];
  fileError: string | null;
  expanded: boolean;
};

type BulkAddItemsDialogProps = {
  listType: string;
  onAdd: (inputs: RichAddInput[]) => void;
  pending?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

const INITIAL_ROW_COUNT = 3;

function createEmptyRow(expanded: boolean): BulkRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    note: "",
    url: "",
    price: "",
    priority: null,
    files: [],
    fileError: null,
    expanded,
  };
}

function BulkAddItemRow({
  row,
  wishlist,
  pending,
  canRemove,
  onChange,
  onRemove,
}: {
  row: BulkRow;
  wishlist: boolean;
  pending: boolean;
  canRemove: boolean;
  onChange: (id: string, patch: Partial<BulkRow>) => void;
  onRemove: (id: string) => void;
}) {
  const tItems = useTranslations("items");
  const tWishlist = useTranslations("wishlist");
  const tBulk = useTranslations("bulkAdd");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFilesSelected(selected: FileList | null) {
    if (!selected?.length) return;
    const next: File[] = [];
    let fileError: string | null = null;

    for (const file of Array.from(selected)) {
      if (row.files.length + next.length >= MAX_IMAGES_PER_ITEM) break;
      const err = validateImageFile(file);
      if (err) {
        fileError = err;
        continue;
      }
      next.push(file);
    }

    onChange(row.id, {
      files: [...row.files, ...next].slice(0, MAX_IMAGES_PER_ITEM),
      fileError,
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <Input
          className="h-10 flex-1 rounded-xl"
          placeholder={wishlist ? tWishlist("namePlaceholder") : tItems("addPlaceholder")}
          value={row.name}
          onChange={(e) => onChange(row.id, { name: e.target.value })}
          disabled={pending}
          aria-label={tBulk("itemNameAria", { index: row.id })}
        />
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(row.id)}
            disabled={pending}
            aria-label={tBulk("removeRow")}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      {!wishlist && (
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => onChange(row.id, { expanded: !row.expanded })}
        >
          <ChevronDown
            className={cn("size-4 transition-transform", row.expanded && "rotate-180")}
            aria-hidden
          />
          {tItems("optionalDetails")}
        </button>
      )}

      {(row.expanded || wishlist) && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <Input
            className="h-10 rounded-xl"
            type="url"
            placeholder={tItems("urlPlaceholder")}
            value={row.url}
            onChange={(e) => onChange(row.id, { url: e.target.value })}
            disabled={pending}
          />
          <textarea
            className="min-h-16 w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={tItems("descriptionPlaceholder")}
            value={row.note}
            onChange={(e) => onChange(row.id, { note: e.target.value })}
            disabled={pending}
          />

          {wishlist && (
            <>
              <Input
                className="h-10 rounded-xl"
                type="number"
                min="0"
                step="0.01"
                placeholder={tWishlist("pricePlaceholder")}
                value={row.price}
                onChange={(e) => onChange(row.id, { price: e.target.value })}
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
                      aria-pressed={row.priority === key}
                      onClick={() =>
                        onChange(row.id, {
                          priority: row.priority === key ? null : key,
                        })
                      }
                      className={cn(
                        "flex-1 rounded-xl border-2 px-3 py-2 text-xs font-medium transition-colors",
                        row.priority === key
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
              disabled={pending || row.files.length >= MAX_IMAGES_PER_ITEM}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="size-4" aria-hidden />
              {tItems("addPhotos")}
            </Button>
            {row.fileError && (
              <p className="text-xs text-destructive">
                {row.fileError === "invalidType"
                  ? tItems("imageInvalidType")
                  : tItems("imageTooLarge")}
              </p>
            )}
            {row.files.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {row.files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(file)}
                      alt=""
                      className="size-14 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] text-white"
                      onClick={() =>
                        onChange(row.id, {
                          files: row.files.filter((_, i) => i !== index),
                        })
                      }
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
    </li>
  );
}

export function BulkAddItemsDialog({
  listType,
  onAdd,
  pending = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger = false,
}: BulkAddItemsDialogProps) {
  const tBulk = useTranslations("bulkAdd");
  const wishlist = isWishlist(listType);

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;

  function handleOpenChange(next: boolean) {
    (controlledOnOpenChange ?? setInternalOpen)(next);
    if (!next) reset();
  }
  const [rows, setRows] = useState<BulkRow[]>(() =>
    Array.from({ length: INITIAL_ROW_COUNT }, () => createEmptyRow(wishlist)),
  );

  function reset() {
    setRows(Array.from({ length: INITIAL_ROW_COUNT }, () => createEmptyRow(wishlist)));
  }

  function updateRow(id: string, patch: Partial<BulkRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow(wishlist)]);
  }

  const validRows = rows.filter((row) => row.name.trim().length > 0);

  function handleSubmit() {
    if (validRows.length === 0 || pending) return;

    const inputs: RichAddInput[] = validRows.map((row) => {
      const parsedPrice = row.price.trim() ? Number.parseFloat(row.price.trim()) : null;
      return {
        name: row.name.trim(),
        url: row.url.trim() || null,
        note: row.note.trim() || null,
        price:
          wishlist && parsedPrice !== null && !Number.isNaN(parsedPrice) ? parsedPrice : null,
        currency: "USD",
        priority: wishlist ? row.priority : null,
        files: row.files,
      };
    });

    onAdd(inputs);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!hideTrigger ? (
        <DialogTrigger
          render={
            <Button type="button" className="h-11 w-full rounded-xl" disabled={pending}>
              {tBulk("trigger")}
            </Button>
          }
        />
      ) : null}

      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tBulk("title")}</DialogTitle>
          <DialogDescription>{tBulk("description")}</DialogDescription>
        </DialogHeader>

        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-1">
          {rows.map((row) => (
            <BulkAddItemRow
              key={row.id}
              row={row}
              wishlist={wishlist}
              pending={pending}
              canRemove={rows.length > 1}
              onChange={updateRow}
              onRemove={removeRow}
            />
          ))}
        </ul>

        <Button
          type="button"
          variant="secondary"
          className="w-fit rounded-xl"
          onClick={addRow}
          disabled={pending || rows.length >= 50}
        >
          <Plus className="size-4" />
          {tBulk("addRow")}
        </Button>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending || validRows.length === 0}
            className="bg-duo-teal text-white hover:bg-duo-teal/90"
          >
            {tBulk("submit", { count: validRows.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
