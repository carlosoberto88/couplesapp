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
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    (controlledOnOpenChange ?? setInternalOpen)(next);
    if (!next) resetForm();
  }

  function resetForm() {
    setName("");
    setType("shopping");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSubmitting(true);
    const { data, error } = await supabase.rpc("create_list", {
      p_name: trimmed,
      p_type: type,
    });
    setSubmitting(false);

    if (error || !data) {
      toast.error(error?.message ?? t("error"));
      return;
    }

    handleOpenChange(false);
    resetForm();
    router.push(`/lists/${data}`);
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
