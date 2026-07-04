"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreVertical, Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { List } from "@/lib/types";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type ListSettingsMenuProps = {
  list: Pick<List, "id" | "name" | "archived_at">;
};

export function ListSettingsMenu({ list }: ListSettingsMenuProps) {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const t = useTranslations("listSettings");
  const tCommon = useTranslations("common");

  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(list.name);
  const [pending, setPending] = useState(false);

  const isArchived = list.archived_at !== null;

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setPending(true);
    const { error } = await supabase
      .from("lists")
      .update({ name: trimmed })
      .eq("id", list.id);
    setPending(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    setRenameOpen(false);
    router.refresh();
  }

  async function toggleArchived() {
    setPending(true);
    const { error } = await supabase
      .from("lists")
      .update({ archived_at: isArchived ? null : new Date().toISOString() })
      .eq("id", list.id);
    setPending(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(isArchived ? t("unarchivedToast") : t("archivedToast"));
    router.refresh();
  }

  async function handleDelete() {
    setPending(true);
    const { error } = await supabase.from("lists").delete().eq("id", list.id);
    setPending(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    setDeleteOpen(false);
    toast.success(t("deletedToast"));
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="size-11 rounded-xl" />}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical />
          <span className="sr-only">{t("menuLabel")}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-xl">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setName(list.name);
              setRenameOpen(true);
            }}
          >
            <Pencil />
            {t("rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              void toggleArchived();
            }}
          >
            {isArchived ? <ArchiveRestore /> : <Archive />}
            {isArchived ? t("unarchive") : t("archive")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteOpen(true);
            }}
          >
            <Trash2 />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{t("renameTitle")}</DialogTitle>
            <DialogDescription>{t("renameDescription")}</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleRename}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`rename-${list.id}`}>{tCommon("name")}</Label>
              <Input
                id={`rename-${list.id}`}
                className="h-11 rounded-xl"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                className="h-11 rounded-xl"
                disabled={pending || !name.trim()}
              >
                {pending ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {t("deleteTitle", { name: list.name })}
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
    </>
  );
}
