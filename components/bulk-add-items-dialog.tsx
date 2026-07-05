"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";

import type { ItemPriority } from "@/lib/types";
import { isWishlist } from "@/lib/list-types";
import type { RichAddInput } from "@/components/rich-add-item-form";
import { ItemDetailsToggle } from "@/components/item-details-toggle";
import { ItemOptionalFields } from "@/components/item-optional-fields";
import { WishlistExtraFields } from "@/components/wishlist-extra-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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

function createEmptyRow(): BulkRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    note: "",
    url: "",
    price: "",
    priority: null,
    files: [],
    fileError: null,
    expanded: false,
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

      <ItemDetailsToggle
        expanded={row.expanded}
        onToggle={() => onChange(row.id, { expanded: !row.expanded })}
      />

      {row.expanded && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <ItemOptionalFields
            url={row.url}
            note={row.note}
            files={row.files}
            fileError={row.fileError}
            pending={pending}
            compact
            onUrlChange={(url) => onChange(row.id, { url })}
            onNoteChange={(note) => onChange(row.id, { note })}
            onFilesChange={(files) => onChange(row.id, { files })}
            onFileErrorChange={(fileError) => onChange(row.id, { fileError })}
          />
          {wishlist ? (
            <WishlistExtraFields
              price={row.price}
              priority={row.priority}
              pending={pending}
              compact
              onPriceChange={(price) => onChange(row.id, { price })}
              onPriorityChange={(priority) => onChange(row.id, { priority })}
            />
          ) : null}
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
    Array.from({ length: INITIAL_ROW_COUNT }, () => createEmptyRow()),
  );

  function reset() {
    setRows(Array.from({ length: INITIAL_ROW_COUNT }, () => createEmptyRow()));
  }

  function updateRow(id: string, patch: Partial<BulkRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow()]);
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

      <DialogContent keyboardAware className="flex flex-col sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>{tBulk("title")}</DialogTitle>
          <DialogDescription>{tBulk("description")}</DialogDescription>
        </DialogHeader>

        <div
          data-dialog-scroll-body
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <ul className="flex flex-col gap-2 py-1">
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
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-fit shrink-0 rounded-xl"
          onClick={addRow}
          disabled={pending || rows.length >= 50}
        >
          <Plus className="size-4" />
          {tBulk("addRow")}
        </Button>

        <DialogFooter className="shrink-0">
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
