"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { CreateListDialog } from "@/components/create-list-dialog";
import { EmptyState } from "@/components/empty-state";

export function ListsEmptyActive() {
  const t = useTranslations("lists");
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <EmptyState
        icon="📋"
        title={t("emptyActiveTitle")}
        description={t("emptyActiveDescription")}
        actionLabel={t("emptyActiveAction")}
        onAction={() => setCreateOpen(true)}
      />
      <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} hideTrigger />
    </>
  );
}
