"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";

import { useSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type ShareWishlistDialogProps = {
  listId: string;
  initialShareToken: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ShareWishlistDialog({
  listId,
  initialShareToken,
  open,
  onOpenChange,
}: ShareWishlistDialogProps) {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const t = useTranslations("listSettings");
  const tShare = useTranslations("shareLink");
  const tErrors = useTranslations("errors");

  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    initialShareToken && typeof window !== "undefined"
      ? `${window.location.origin}/w/${initialShareToken}`
      : "";

  async function handleSharePublicly() {
    const shareToken = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");

    setPending(true);
    const { data, error } = await supabase
      .from("lists")
      .update({ share_token: shareToken })
      .eq("id", listId)
      .select("id");
    setPending(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    // RLS silently no-ops writes it blocks (error: null, 0 rows) instead of
    // erroring, so an empty result set means the update didn't actually apply.
    if (!data || data.length === 0) {
      toast.error(tErrors("genericTitle"));
      return;
    }
    router.refresh();
  }

  async function handleStopSharing() {
    setPending(true);
    const { data, error } = await supabase
      .from("lists")
      .update({ share_token: null })
      .eq("id", listId)
      .select("id");
    setPending(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data || data.length === 0) {
      toast.error(tErrors("genericTitle"));
      return;
    }
    setCopied(false);
    router.refresh();
  }

  async function handleCopyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success(tShare("linkCopied"));
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {tShare("sharePublicly")}
          </DialogTitle>
          <DialogDescription>{tShare("shareDescription")}</DialogDescription>
        </DialogHeader>
        {initialShareToken ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`share-link-${listId}`}>{tShare("shareLinkLabel")}</Label>
              <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
                <span
                  id={`share-link-${listId}`}
                  className="flex-1 truncate text-xs text-muted-foreground"
                >
                  {shareUrl}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 rounded-lg"
                  onClick={() => void handleCopyLink()}
                >
                  {copied ? <Check /> : <Copy />}
                  {copied ? tShare("linkCopied") : tShare("copyLink")}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{tShare("sharedStatus")}</p>
          </div>
        ) : null}
        <DialogFooter>
          {initialShareToken ? (
            <Button
              variant="destructive"
              className="h-11 rounded-xl"
              disabled={pending}
              onClick={() => void handleStopSharing()}
            >
              {pending ? t("saving") : tShare("stopSharing")}
            </Button>
          ) : (
            <Button
              className="h-11 rounded-xl"
              disabled={pending}
              onClick={() => void handleSharePublicly()}
            >
              {pending ? t("saving") : tShare("sharePublicly")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
