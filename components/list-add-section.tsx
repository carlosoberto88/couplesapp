"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";

import type { RichAddInput } from "@/components/rich-add-item-form";
import { RichAddItemForm } from "@/components/rich-add-item-form";
import { AddFromLinkForm } from "@/components/add-from-link-form";
import { BulkAddItemsDialog } from "@/components/bulk-add-items-dialog";
import { SmartAdd } from "@/components/smart-add";
import { UsualItems } from "@/components/usual-items";
import { Button } from "@/components/ui/button";
import { isWishlist } from "@/lib/list-types";
import type { LinkPreviewData } from "@/lib/persist-item";
import type { ItemPriority } from "@/lib/types";

type AddMode = "link" | "manual";

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

function AddModeSwitch({
  mode,
  onSwitch,
  compact = false,
}: {
  mode: AddMode;
  onSwitch: (mode: AddMode) => void;
  compact?: boolean;
}) {
  const t = useTranslations("addFromLink");

  return (
    <button
      type="button"
      className={
        compact
          ? "text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          : "text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      }
      onClick={() => onSwitch(mode === "link" ? "manual" : "link")}
    >
      {mode === "link" ? t("addWithoutLink") : t("addFromLink")}
    </button>
  );
}

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
  const tAddFromLink = useTranslations("addFromLink");
  const [internalBulkOpen, setInternalBulkOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("link");

  const wishlist = isWishlist(listType);
  const isBulkOpen = bulkOpen ?? internalBulkOpen;
  const setBulkOpen = onBulkOpenChange ?? setInternalBulkOpen;

  const wishlistLinkAdd = wishlist && onAddFromLink;

  return (
    <>
      {wishlistLinkAdd ? (
        <div className="hidden md:block">
          {addMode === "link" ? (
            <>
              <AddFromLinkForm
                listId={listId}
                pending={pending}
                onConfirm={onAddFromLink}
                onManualAdd={() => setAddMode("manual")}
              />
              <div className="mt-2">
                <AddModeSwitch mode="link" onSwitch={setAddMode} />
              </div>
            </>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted-foreground">{tAddFromLink("manualLabel")}</p>
              <RichAddItemForm listType={listType} onAdd={onRichAdd} pending={pending} />
              <div className="mt-2">
                <AddModeSwitch mode="manual" onSwitch={setAddMode} />
              </div>
            </>
          )}
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
            addMode === "link" ? (
              <>
                <AddFromLinkForm
                  listId={listId}
                  pending={pending}
                  onConfirm={onAddFromLink}
                  onManualAdd={() => setAddMode("manual")}
                  variant="sticky"
                />
                <AddModeSwitch mode="link" onSwitch={setAddMode} compact />
              </>
            ) : (
              <>
                <RichAddItemForm
                  listType={listType}
                  onAdd={onRichAdd}
                  pending={pending}
                  variant="sticky"
                />
                <AddModeSwitch mode="manual" onSwitch={setAddMode} compact />
              </>
            )
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
