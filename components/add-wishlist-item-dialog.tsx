"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

import type { RichAddInput } from "@/components/rich-add-item-form";
import { RichAddItemForm } from "@/components/rich-add-item-form";
import { AddFromLinkForm } from "@/components/add-from-link-form";
import { AddModeSegment, type AddMode } from "@/components/add-mode-segment";
import { Button } from "@/components/ui/button";
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

type AddWishlistItemDialogProps = {
  listId: string;
  pending?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  onRichAdd: (input: RichAddInput) => void;
  onAddFromLink: (
    previewToken: string,
    preview: LinkPreviewData,
    priority: ItemPriority | null,
  ) => Promise<boolean>;
};

export function AddWishlistItemDialog({
  listId,
  pending = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger = false,
  onRichAdd,
  onAddFromLink,
}: AddWishlistItemDialogProps) {
  const t = useTranslations("addMenu");

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;

  const [addMode, setAddMode] = useState<AddMode>("manual");
  const [manualPrefillUrl, setManualPrefillUrl] = useState<string | null>(null);

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
              {t("addItem")}
            </Button>
          }
        />
      ) : null}

      <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("addItemTitle")}</DialogTitle>
          <DialogDescription>{t("addItemDescription")}</DialogDescription>
        </DialogHeader>

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
              listType="wishlist"
              onAdd={handleRichAdd}
              pending={pending}
              initialUrl={manualPrefillUrl}
              autoExpandDetails={Boolean(manualPrefillUrl)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
