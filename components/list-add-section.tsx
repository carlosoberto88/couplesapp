"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Layers, Plus } from "lucide-react";

import type { RichAddInput } from "@/components/rich-add-item-form";
import { RichAddItemForm } from "@/components/rich-add-item-form";
import { AddWishlistItemDialog } from "@/components/add-wishlist-item-dialog";
import { BulkAddItemsDialog } from "@/components/bulk-add-items-dialog";
import { SmartAdd } from "@/components/smart-add";
import { UsualItems } from "@/components/usual-items";
import { Button } from "@/components/ui/button";
import { isWishlist } from "@/lib/list-types";
import type { LinkPreviewData } from "@/lib/persist-item";
import { useStickyAddBarHeight } from "@/lib/use-sticky-add-bar-height";
import type { ItemPriority } from "@/lib/types";

type ListAddSectionProps = {
  listId: string;
  listType: string;
  pending?: boolean;
  currentItemNames: string[];
  showUsualItems?: boolean;
  showSmartAdd?: boolean;
  onRichAdd: (input: RichAddInput) => void;
  onQuickAdd: (name: string) => void;
  onBulkAdd: (inputs: RichAddInput[]) => void;
  onSmartAddBulk: (items: { name: string; note: string | null }[]) => void;
  onAddFromLink?: (
    previewToken: string,
    preview: LinkPreviewData,
    priority: ItemPriority | null,
  ) => Promise<boolean>;
  bulkOpen?: boolean;
  onBulkOpenChange?: (open: boolean) => void;
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
};

export function ListAddSection({
  listId,
  listType,
  pending = false,
  currentItemNames,
  showUsualItems = true,
  showSmartAdd = true,
  onRichAdd,
  onQuickAdd,
  onBulkAdd,
  onSmartAddBulk,
  onAddFromLink,
  bulkOpen,
  onBulkOpenChange,
  addOpen,
  onAddOpenChange,
}: ListAddSectionProps) {
  const t = useTranslations("addMenu");
  const [internalBulkOpen, setInternalBulkOpen] = useState(false);
  const [internalAddOpen, setInternalAddOpen] = useState(false);
  const stickyBarRef = useRef<HTMLDivElement>(null);

  useStickyAddBarHeight(stickyBarRef);

  const wishlist = isWishlist(listType);
  const isBulkOpen = bulkOpen ?? internalBulkOpen;
  const setBulkOpen = onBulkOpenChange ?? setInternalBulkOpen;
  const isAddOpen = addOpen ?? internalAddOpen;
  const setAddOpen = onAddOpenChange ?? setInternalAddOpen;

  const wishlistLinkAdd = wishlist && onAddFromLink;

  return (
    <>
      {!wishlistLinkAdd ? (
        <div className="hidden md:block">
          <RichAddItemForm listType={listType} onAdd={onRichAdd} pending={pending} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {wishlistLinkAdd ? (
          <Button
            type="button"
            size="sm"
            className="hidden rounded-full md:inline-flex"
            onClick={() => setAddOpen(true)}
            disabled={pending}
          >
            <Plus className="size-4" />
            {t("addItem")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="rounded-full"
          onClick={() => setBulkOpen(true)}
        >
          <Layers className="size-4" />
          {t("addMultiple")}
        </Button>
        {showSmartAdd ? (
          <SmartAdd listId={listId} onAddBulk={onSmartAddBulk} variant="menu" />
        ) : null}
      </div>

      {showUsualItems ? (
        <UsualItems listId={listId} currentItemNames={currentItemNames} onAdd={onQuickAdd} />
      ) : null}

      {wishlistLinkAdd ? (
        <AddWishlistItemDialog
          listId={listId}
          pending={pending}
          open={isAddOpen}
          onOpenChange={setAddOpen}
          hideTrigger
          onRichAdd={onRichAdd}
          onAddFromLink={onAddFromLink}
        />
      ) : null}

      <BulkAddItemsDialog
        listType={listType}
        onAdd={onBulkAdd}
        pending={pending}
        open={isBulkOpen}
        onOpenChange={setBulkOpen}
        hideTrigger
      />

      <div
        ref={stickyBarRef}
        className="sticky-add-bar pointer-events-none fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden"
      >
        <div className="pointer-events-auto mx-auto flex w-full max-w-[640px] flex-col gap-2">
          {wishlistLinkAdd ? (
            <Button
              type="button"
              className="h-11 w-full rounded-xl"
              onClick={() => setAddOpen(true)}
              disabled={pending}
            >
              <Plus className="size-4" />
              {t("addItem")}
            </Button>
          ) : (
            <RichAddItemForm
              listType={listType}
              onAdd={onRichAdd}
              pending={pending}
              variant="sticky"
            />
          )}
        </div>
      </div>
    </>
  );
}
