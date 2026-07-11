"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { Occasion, OccasionCategory } from "@/lib/types";
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
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const OCCASION_CATEGORIES: OccasionCategory[] = ["birthday", "anniversary", "other"];

// Native select styled to match Input (no select primitive exists in the ui/ kit yet).
const selectClass =
  "h-11 w-full rounded-xl border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

type OccasionDialogProps = {
  partnershipId: string;
  currentUserId: string;
  members: { userId: string; label: string }[];
  wishlists: { id: string; name: string }[];
  occasion?: Occasion;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function OccasionDialog({
  partnershipId,
  currentUserId,
  members,
  wishlists,
  occasion,
  open,
  onOpenChange,
  onSaved,
}: OccasionDialogProps) {
  const supabase = useSupabaseClient();
  const t = useTranslations("dates");
  const isEdit = occasion != null;

  // Seeded once at mount from `occasion`; the parent remounts this dialog
  // (via a `key` tied to open state + occasion id) each time it opens, so
  // these initializers always reflect the latest data without an effect.
  const [label, setLabel] = useState(occasion?.label ?? "");
  const [date, setDate] = useState(occasion?.occasion_date ?? "");
  const [recurring, setRecurring] = useState(occasion?.recurring ?? true);
  const [category, setCategory] = useState<OccasionCategory>(occasion?.category ?? "other");
  const [celebrantId, setCelebrantId] = useState(occasion?.celebrant_user_id ?? "");
  const [linkedListId, setLinkedListId] = useState(occasion?.linked_list_id ?? "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const trimmedLabel = label.trim();
    if (!trimmedLabel || !date) return;

    setPending(true);
    const fields = {
      label: trimmedLabel,
      occasion_date: date,
      recurring,
      category,
      celebrant_user_id: celebrantId || null,
      linked_list_id: linkedListId || null,
    };

    const { error } = occasion
      ? await supabase.from("occasions").update(fields).eq("id", occasion.id)
      : await supabase.from("occasions").insert({
          partnership_id: partnershipId,
          created_by: currentUserId,
          ...fields,
        });
    setPending(false);

    if (error) {
      toast.error(error.message || t("error"));
      return;
    }

    toast.success(isEdit ? t("savedToast") : t("addedToast"));
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {isEdit ? t("editTitle") : t("addTitle")}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t("editDescription") : t("addDescription")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="occasion-label">{t("labelField")}</Label>
            <Input
              id="occasion-label"
              className="h-11 rounded-xl"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="occasion-date">{t("dateField")}</Label>
            <Input
              id="occasion-date"
              type="date"
              className="h-11 rounded-xl"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="occasion-category">{t("categoryField")}</Label>
            <select
              id="occasion-category"
              className={selectClass}
              value={category}
              onChange={(e) => setCategory(e.target.value as OccasionCategory)}
            >
              {OCCASION_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {t(`category.${key}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="occasion-recurring">{t("recurringField")}</Label>
              <p className="text-xs text-muted-foreground">{t("recurringHint")}</p>
            </div>
            <button
              id="occasion-recurring"
              type="button"
              role="switch"
              aria-checked={recurring}
              onClick={() => setRecurring((v) => !v)}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                recurring ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform",
                  recurring && "translate-x-5",
                )}
              />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="occasion-celebrant">{t("celebrantField")}</Label>
            <select
              id="occasion-celebrant"
              className={selectClass}
              value={celebrantId}
              onChange={(e) => setCelebrantId(e.target.value)}
            >
              <option value="">{t("celebrantBoth")}</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="occasion-linked-list">{t("linkedListField")}</Label>
            <select
              id="occasion-linked-list"
              className={selectClass}
              value={linkedListId}
              onChange={(e) => setLinkedListId(e.target.value)}
            >
              <option value="">{t("linkedListNone")}</option>
              {wishlists.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="h-11 rounded-xl"
              disabled={pending || !label.trim() || !date}
            >
              {pending ? t("saving") : isEdit ? t("save") : t("addSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
