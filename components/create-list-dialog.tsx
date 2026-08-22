"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import { type ListTypeKey } from "@/lib/list-types";
import { CreateListForm } from "@/components/create-list-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CreateListDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger = false,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
} = {}) {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const t = useTranslations("createList");

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [name, setName] = useState("");
  const [type, setType] = useState<ListTypeKey>("shopping");
  const [recurring, setRecurring] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    (controlledOnOpenChange ?? setInternalOpen)(next);
    if (!next) resetForm();
  }

  function resetForm() {
    setName("");
    setType("shopping");
    setRecurring(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSubmitting(true);
    const { data, error } = await supabase.rpc("create_list", {
      p_name: trimmed,
      p_type: type,
      p_recurring: recurring,
    });

    if (error || !data) {
      setSubmitting(false);
      toast.error(error?.message ?? t("error"));
      return;
    }

    // ponytail: replace, and no explicit close. The shared Dialog only returns
    // its history entry on a close, never on unmount — so `replace` reuses that
    // entry for the new list instead of racing history.back() against the push,
    // and back from the new list still lands on /lists exactly once.
    router.replace(`/lists/${data}`);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!hideTrigger ? (
        <DialogTrigger render={<Button size="lg" className="h-11 rounded-xl px-4" />}>
          {t("trigger")}
        </DialogTrigger>
      ) : null}
      <DialogContent className="rounded-2xl bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <CreateListForm
            name={name}
            onNameChange={setName}
            type={type}
            onTypeChange={setType}
            recurring={recurring}
            onRecurringChange={setRecurring}
            autoFocus
          />
          <DialogFooter>
            <Button
              type="submit"
              size="lg"
              className="h-11 w-full rounded-xl px-5 sm:w-auto"
              disabled={submitting || !name.trim()}
            >
              {submitting ? t("creating") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
