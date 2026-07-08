"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { EllipsisVertical, Plus, Share2 } from "lucide-react";

import type { RichAddInput } from "@/components/rich-add-item-form";
import { AddItemDialog } from "@/components/add-item-dialog";
import { BulkAddItemsDialog } from "@/components/bulk-add-items-dialog";
import { SmartAdd } from "@/components/smart-add";
import { UsualItems } from "@/components/usual-items";
import { ShareWishlistDialog } from "@/components/share-wishlist-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  isOwner?: boolean;
  shareToken?: string | null;
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
  isOwner = false,
  shareToken = null,
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
  const tSmartAdd = useTranslations("smartAdd");
  const tShare = useTranslations("shareLink");
  const [internalBulkOpen, setInternalBulkOpen] = useState(false);
  const [internalAddOpen, setInternalAddOpen] = useState(false);
  const [smartAddOpen, setSmartAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const stickyBarRef = useRef<HTMLDivElement>(null);

  useStickyAddBarHeight(stickyBarRef);

  const wishlist = isWishlist(listType);
  const canShare = wishlist && isOwner;
  const isBulkOpen = bulkOpen ?? internalBulkOpen;
  const setBulkOpen = onBulkOpenChange ?? setInternalBulkOpen;
  const isAddOpen = addOpen ?? internalAddOpen;
  const setAddOpen = onAddOpenChange ?? setInternalAddOpen;

  const addItemLabel = wishlist ? t("addItemWishlist") : t("addItem");

  const addMenuItems = (
    <>
      <DropdownMenuItem onClick={() => setBulkOpen(true)}>{t("addMultiple")}</DropdownMenuItem>
      {showSmartAdd ? (
        <DropdownMenuItem onClick={() => setSmartAddOpen(true)}>
          {tSmartAdd("menuLabel")}
        </DropdownMenuItem>
      ) : null}
    </>
  );

  return (
    <>
      <div className="hidden md:flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="rounded-full"
          onClick={() => setAddOpen(true)}
          disabled={pending}
        >
          <Plus className="size-4" />
          {addItemLabel}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" className="size-9 rounded-full" />}
          >
            <EllipsisVertical className="size-4" />
            <span className="sr-only">{t("moreOptions")}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="rounded-xl">
            {addMenuItems}
          </DropdownMenuContent>
        </DropdownMenu>
        {canShare ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 rounded-full"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="size-4" />
            <span className="sr-only">{tShare("shareButton")}</span>
          </Button>
        ) : null}
      </div>

      {showUsualItems ? (
        <UsualItems listId={listId} currentItemNames={currentItemNames} onAdd={onQuickAdd} />
      ) : null}

      <AddItemDialog
        listId={listId}
        listType={listType}
        pending={pending}
        open={isAddOpen}
        onOpenChange={setAddOpen}
        hideTrigger
        onRichAdd={onRichAdd}
        onAddFromLink={onAddFromLink}
      />

      <BulkAddItemsDialog
        listType={listType}
        onAdd={onBulkAdd}
        pending={pending}
        open={isBulkOpen}
        onOpenChange={setBulkOpen}
        hideTrigger
      />

      {showSmartAdd ? (
        <SmartAdd
          listId={listId}
          onAddBulk={onSmartAddBulk}
          variant="menu"
          open={smartAddOpen}
          onOpenChange={setSmartAddOpen}
          hideTrigger
        />
      ) : null}

      <div
        ref={stickyBarRef}
        className="sticky-add-bar pointer-events-none fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden"
      >
        <div className="pointer-events-auto mx-auto flex w-full max-w-[640px] items-center gap-2">
          <Button
            type="button"
            className="h-11 flex-1 rounded-xl"
            onClick={() => setAddOpen(true)}
            disabled={pending}
          >
            <Plus className="size-4" />
            {addItemLabel}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" className="size-11 rounded-xl" />}
            >
              <EllipsisVertical className="size-4" />
              <span className="sr-only">{t("moreOptions")}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="rounded-xl">
              {addMenuItems}
            </DropdownMenuContent>
          </DropdownMenu>
          {canShare ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 rounded-xl"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="size-4" />
              <span className="sr-only">{tShare("shareButton")}</span>
            </Button>
          ) : null}
        </div>
      </div>

      {canShare ? (
        <ShareWishlistDialog
          listId={listId}
          initialShareToken={shareToken}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      ) : null}
    </>
  );
}
