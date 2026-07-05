"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";

import type { RichAddInput } from "@/components/rich-add-item-form";
import { RichAddItemForm } from "@/components/rich-add-item-form";
import { AddFromLinkForm } from "@/components/add-from-link-form";
import { AddModeSegment, type AddMode } from "@/components/add-mode-segment";
import { BulkAddItemsDialog } from "@/components/bulk-add-items-dialog";
import { SmartAdd } from "@/components/smart-add";
import { UsualItems } from "@/components/usual-items";
import { Button } from "@/components/ui/button";
import { isWishlist } from "@/lib/list-types";
import type { LinkPreviewData } from "@/lib/persist-item";
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
}: ListAddSectionProps) {
  const t = useTranslations("addMenu");
  const [internalBulkOpen, setInternalBulkOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("manual");
  const [manualPrefillUrl, setManualPrefillUrl] = useState<string | null>(null);

  const wishlist = isWishlist(listType);
  const isBulkOpen = bulkOpen ?? internalBulkOpen;
  const setBulkOpen = onBulkOpenChange ?? setInternalBulkOpen;

  const wishlistLinkAdd = wishlist && onAddFromLink;

  function handleSwitchMode(mode: AddMode) {
    if (mode === "link") {
      setManualPrefillUrl(null);
    }
    setAddMode(mode);
  }

  function handleManualAddFromLink(url?: string) {
    setManualPrefillUrl(url?.trim() || null);
    setAddMode("manual");
  }

  const manualFormKey = manualPrefillUrl ?? "manual-default";
  const manualFormProps = {
    listType,
    onAdd: onRichAdd,
    pending,
    key: manualFormKey,
    initialUrl: manualPrefillUrl,
    autoExpandDetails: Boolean(manualPrefillUrl),
  } as const;

  return (
    <>
      {wishlistLinkAdd ? (
        <div className="hidden md:block">
          <AddModeSegment mode={addMode} onChange={handleSwitchMode} />
          <div className="mt-3">
            {addMode === "link" ? (
              <AddFromLinkForm
                listId={listId}
                pending={pending}
                onConfirm={onAddFromLink}
                onManualAdd={handleManualAddFromLink}
              />
            ) : (
              <RichAddItemForm {...manualFormProps} />
            )}
          </div>
        </div>
      ) : (
        <div className="hidden md:block">
          <RichAddItemForm listType={listType} onAdd={onRichAdd} pending={pending} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
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

      <BulkAddItemsDialog
        listType={listType}
        onAdd={onBulkAdd}
        pending={pending}
        open={isBulkOpen}
        onOpenChange={setBulkOpen}
        hideTrigger
      />

      <div className="sticky-add-bar pointer-events-none fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden">
        <div className="pointer-events-auto mx-auto flex w-full max-w-[640px] flex-col gap-2">
          {wishlistLinkAdd ? (
            <>
              <AddModeSegment mode={addMode} onChange={handleSwitchMode} compact />
              {addMode === "link" ? (
                <AddFromLinkForm
                  listId={listId}
                  pending={pending}
                  onConfirm={onAddFromLink}
                  onManualAdd={handleManualAddFromLink}
                  variant="sticky"
                />
              ) : (
                <RichAddItemForm {...manualFormProps} variant="sticky" />
              )}
            </>
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
