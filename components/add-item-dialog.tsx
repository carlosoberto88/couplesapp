"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

import type { RichAddInput } from "@/components/rich-add-item-form";
import { RichAddItemForm } from "@/components/rich-add-item-form";
import { AddFromLinkForm } from "@/components/add-from-link-form";
import { AddModeSegment, type AddMode } from "@/components/add-mode-segment";
import { Button } from "@/components/ui/button";
import { isWishlist } from "@/lib/list-types";
import type { LinkPreviewData } from "@/lib/persist-item";
import type { ItemPriority } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type AddItemDialogProps = {
  listId: string;
  listType: string;
  pending?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  onRichAdd: (input: RichAddInput) => void;
  onAddFromLink?: (
    previewToken: string,
    preview: LinkPreviewData,
    priority: ItemPriority | null,
  ) => Promise<boolean>;
};

export function AddItemDialog({
  listId,
  listType,
  pending = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger = false,
  onRichAdd,
  onAddFromLink,
}: AddItemDialogProps) {
  const t = useTranslations("addMenu");

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;

  const [addMode, setAddMode] = useState<AddMode>("manual");
  const [manualPrefillUrl, setManualPrefillUrl] = useState<string | null>(null);

  const wishlist = isWishlist(listType);
  const supportsLinkAdd = wishlist && onAddFromLink;

  const addItemLabel = wishlist ? t("addItemWishlist") : t("addItem");
  const addItemTitle = wishlist ? t("addItemTitleWishlist") : t("addItemTitle");
  const addItemDescription = wishlist
    ? t("addItemDescriptionWishlist")
    : t("addItemDescription");

  function reset() {
    setAddMode("manual");
    setManualPrefillUrl(null);
  }

  function handleOpenChange(next: boolean) {
    (controlledOnOpenChange ?? setInternalOpen)(next);
    if (!next) reset();
  }

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

  function handleRichAdd(input: RichAddInput) {
    onRichAdd(input);
    handleOpenChange(false);
  }

  async function handleAddFromLink(
    previewToken: string,
    preview: LinkPreviewData,
    priority: ItemPriority | null,
  ): Promise<boolean> {
    if (!onAddFromLink) return false;
    const success = await onAddFromLink(previewToken, preview, priority);
    if (success) handleOpenChange(false);
    return success;
  }

  const manualFormKey = manualPrefillUrl ?? "manual-default";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!hideTrigger ? (
        <DialogTrigger
          render={
            <Button type="button" className="h-11 w-full rounded-xl" disabled={pending}>
              <Plus className="size-4" />
              {addItemLabel}
            </Button>
          }
        />
      ) : null}

      <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{addItemTitle}</DialogTitle>
          <DialogDescription>{addItemDescription}</DialogDescription>
        </DialogHeader>

        {supportsLinkAdd ? (
          <>
            <AddModeSegment mode={addMode} onChange={handleSwitchMode} />
            <div className="mt-1">
              {addMode === "link" ? (
                <AddFromLinkForm
                  listId={listId}
                  pending={pending}
                  onConfirm={handleAddFromLink}
                  onManualAdd={handleManualAddFromLink}
                />
              ) : (
                <RichAddItemForm
                  key={manualFormKey}
                  listType={listType}
                  onAdd={handleRichAdd}
                  pending={pending}
                  initialUrl={manualPrefillUrl}
                  autoExpandDetails={Boolean(manualPrefillUrl)}
                />
              )}
            </div>
          </>
        ) : (
          <RichAddItemForm listType={listType} onAdd={handleRichAdd} pending={pending} />
        )}
      </DialogContent>
    </Dialog>
  );
}
