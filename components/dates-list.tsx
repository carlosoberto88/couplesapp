"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarHeart, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";

import { useSupabaseClient } from "@/lib/supabase/client";
import { daysUntilOccasion, sortOccasionsByProximity } from "@/lib/occasion-utils";
import type { Occasion } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { OccasionDialog } from "@/components/occasion-dialog";

type Member = { userId: string; label: string };
type Wishlist = { id: string; name: string };

type DatesListProps = {
  partnershipId: string;
  initialOccasions: Occasion[];
  members: Member[];
  wishlists: Wishlist[];
  currentUserId: string;
};

function formatOccasionDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function DatesList({
  partnershipId,
  initialOccasions,
  members,
  wishlists,
  currentUserId,
}: DatesListProps) {
  const router = useRouter();
  const t = useTranslations("dates");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOccasion, setEditingOccasion] = useState<Occasion | undefined>(undefined);

  const today = new Date();
  const sorted = sortOccasionsByProximity(initialOccasions, today);

  function openCreate() {
    setEditingOccasion(undefined);
    setDialogOpen(true);
  }

  function openEdit(occasion: Occasion) {
    setEditingOccasion(occasion);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button className="h-11 rounded-xl px-4" onClick={openCreate}>
          <Plus />
          {t("addTrigger")}
        </Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={<CalendarHeart className="size-6" />} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((occasion) => (
            <OccasionRow
              key={occasion.id}
              occasion={occasion}
              members={members}
              wishlists={wishlists}
              today={today}
              onEdit={() => openEdit(occasion)}
            />
          ))}
        </ul>
      )}

      <OccasionDialog
        key={dialogOpen ? (editingOccasion?.id ?? "create") : "closed"}
        partnershipId={partnershipId}
        currentUserId={currentUserId}
        members={members}
        wishlists={wishlists}
        occasion={editingOccasion}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          setEditingOccasion(undefined);
          router.refresh();
        }}
      />
    </div>
  );
}

function OccasionRow({
  occasion,
  members,
  wishlists,
  today,
  onEdit,
}: {
  occasion: Occasion;
  members: Member[];
  wishlists: Wishlist[];
  today: Date;
  onEdit: () => void;
}) {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const t = useTranslations("dates");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const days = daysUntilOccasion(occasion.occasion_date, occasion.recurring, today);
  const celebrant = members.find((m) => m.userId === occasion.celebrant_user_id);
  const linkedList = wishlists.find((w) => w.id === occasion.linked_list_id);

  async function handleDelete() {
    setPending(true);
    const { error } = await supabase.from("occasions").delete().eq("id", occasion.id);
    setPending(false);
    if (error) {
      toast.error(error.message || t("error"));
      return;
    }
    setDeleteOpen(false);
    toast.success(t("deletedToast"));
    router.refresh();
  }

  return (
    <li>
      <Card className="rounded-2xl">
        <CardContent className="flex items-center gap-3 py-1">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate font-display text-base font-semibold text-foreground">
                {occasion.label}
              </span>
              <Badge variant={days < 0 ? "outline" : days === 0 ? "default" : "secondary"}>
                {days === 0
                  ? t("countdownToday")
                  : days < 0
                    ? t("countdownPassed")
                    : t("countdownDays", { days })}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatOccasionDate(occasion.occasion_date)} · {t(`category.${occasion.category}`)}
              {celebrant
                ? ` · ${t("forCelebrant", { name: celebrant.label })}`
                : ` · ${t("forBoth")}`}
            </span>
            {linkedList ? (
              <span className="truncate text-xs text-muted-foreground">
                {t("linkedListHint", { name: linkedList.name })}
              </span>
            ) : null}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="size-11 shrink-0 rounded-xl" />}
            >
              <MoreVertical />
              <span className="sr-only">{t("menuLabel")}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil />
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {t("deleteTitle", { name: occasion.label })}
            </DialogTitle>
            <DialogDescription>{t("deleteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="destructive"
              className="h-11 rounded-xl"
              disabled={pending}
              onClick={handleDelete}
            >
              {pending ? t("deleting") : t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
