"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import { LIST_TYPE_KEYS, getListTypeIcon, type ListTypeKey } from "@/lib/list-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function CreateListDialog() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const t = useTranslations("createList");
  const tListTypes = useTranslations("listTypes");
  const tCommon = useTranslations("common");

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<ListTypeKey>("shopping");
  const [submitting, setSubmitting] = useState(false);

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

    setOpen(false);
    resetForm();
    router.push(`/lists/${data}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger render={<Button size="lg" className="h-11 rounded-xl px-4" />}>
        {t("trigger")}
      </DialogTrigger>
      <DialogContent className="rounded-2xl bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="list-name">{tCommon("name")}</Label>
            <Input
              id="list-name"
              className="h-11 rounded-xl"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("typeLabel")}</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {LIST_TYPE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setType(key)}
                  aria-pressed={type === key}
                  className={cn(
                    "flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-2.5 text-xs font-medium transition-colors",
                    type === key
                      ? "border-primary bg-duo-coral-tint text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  <span className="text-xl leading-none">{getListTypeIcon(key)}</span>
                  {tListTypes(key)}
                </button>
              ))}
            </div>
          </div>
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
