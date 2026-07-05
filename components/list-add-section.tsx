"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";

import type { RichAddInput } from "@/components/rich-add-item-form";
import { RichAddItemForm } from "@/components/rich-add-item-form";
import { BulkAddItemsDialog } from "@/components/bulk-add-items-dialog";
import { SmartAdd } from "@/components/smart-add";
import { UsualItems } from "@/components/usual-items";
import { Button } from "@/components/ui/button";

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
  bulkOpen,
  onBulkOpenChange,
}: ListAddSectionProps) {
  const t = useTranslations("addMenu");
  const [internalBulkOpen, setInternalBulkOpen] = useState(false);

  const isBulkOpen = bulkOpen ?? internalBulkOpen;
  const setBulkOpen = onBulkOpenChange ?? setInternalBulkOpen;

  return (
    <>
      <div className="hidden md:block">
        <RichAddItemForm listType={listType} onAdd={onRichAdd} pending={pending} />
      </div>

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
        <div className="pointer-events-auto mx-auto w-full max-w-[640px]">
          <RichAddItemForm
            listType={listType}
            onAdd={onRichAdd}
            pending={pending}
            variant="sticky"
          />
        </div>
      </div>
    </>
  );
}
