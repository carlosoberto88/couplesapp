"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Heart, Copy, Check, X } from "lucide-react";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { Partnership, PartnerInvite, Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PartnerProfile = Pick<Profile, "id" | "display_name" | "email">;
type PendingInvite = Pick<PartnerInvite, "id" | "email">;

type InviteResponse = {
  status?: "invited_email_sent" | "invited_copy_link" | "invited_push_sent" | "email_failed";
  invite_id?: string;
  inviteUrl?: string;
  error?: string;
};

type ConfirmAction =
  | { type: "revoke_invite"; inviteId: string; email: string }
  | { type: "unpair" };

export function PartnerPanel() {
  const supabase = useSupabaseClient();
  const t = useTranslations("partner");

  const [loading, setLoading] = useState(true);
  const [partnership, setPartnership] = useState<Partnership | null>(null);
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [label, setLabel] = useState("");
  const [labelSaving, setLabelSaving] = useState(false);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: pid } = await supabase.rpc("active_partnership_id");
        if (cancelled) return;

        if (!pid) {
          setPartnership(null);
          setPartner(null);
          const { data } = await supabase
            .from("partner_invites")
            .select("id, email")
            .eq("status", "pending");
          if (!cancelled) setPendingInvites((data as PendingInvite[]) ?? []);
          return;
        }

        const [{ data: partnershipRow }, { data: partnerId }] = await Promise.all([
          supabase.from("partnerships").select("*").eq("id", pid).maybeSingle(),
          supabase.rpc("active_partner_id"),
        ]);
        if (cancelled) return;

        setPartnership((partnershipRow as Partnership) ?? null);
        setLabel(partnershipRow?.label ?? "");

        if (!partnerId) {
          setPartner(null);
          return;
        }

        const { data: partnerProfile } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .eq("id", partnerId)
          .maybeSingle();
        if (!cancelled) setPartner((partnerProfile as PartnerProfile) ?? null);
      } catch {
        if (!cancelled) toast.error(t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, t]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setInviteUrl(null);

    try {
      const res = await fetch("/api/partner-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data: InviteResponse = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error ?? t("sendError"));
        return;
      }

      setEmail("");
      setPendingInvites((prev) =>
        prev.some((i) => i.email === trimmed)
          ? prev
          : [...prev, { id: data.invite_id ?? `optimistic-${trimmed}`, email: trimmed }],
      );

      if (data.status === "invited_copy_link" || data.status === "email_failed") {
        setInviteUrl(data.inviteUrl ?? null);
        toast(
          data.status === "email_failed"
            ? t("emailFailed")
            : t("copyLinkToast", { email: trimmed }),
        );
      } else {
        toast.success(t("emailSent", { email: trimmed }));
      }
    } catch {
      toast.error(t("sendError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success(t("linkCopied"));
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveLabel() {
    if (!partnership) return;
    const trimmed = label.trim();
    if (trimmed === (partnership.label ?? "")) return;

    setLabelSaving(true);
    const { error } = await supabase
      .from("partnerships")
      .update({ label: trimmed || null })
      .eq("id", partnership.id);
    setLabelSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setPartnership({ ...partnership, label: trimmed || null });
    toast.success(t("labelSaved"));
  }

  async function handleConfirmAction() {
    if (!confirmAction) return;

    setActionPending(true);

    if (confirmAction.type === "unpair") {
      const { error } = await supabase
        .from("partnerships")
        .update({ status: "ended" })
        .eq("id", partnership?.id ?? "");

      setActionPending(false);

      if (error) {
        toast.error(error.message);
        return;
      }

      setPartnership(null);
      setPartner(null);
      setLabel("");
      setPendingInvites([]);
      toast.success(t("unpaired"));
      setConfirmAction(null);
      return;
    }

    const { error } = await supabase
      .from("partner_invites")
      .update({ status: "revoked" })
      .eq("id", confirmAction.inviteId)
      .eq("status", "pending");

    setActionPending(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setPendingInvites((prev) => prev.filter((invite) => invite.id !== confirmAction.inviteId));
    toast.success(t("cancelledInvite", { email: confirmAction.email }));
    setConfirmAction(null);
  }

  const partnerLabel = partner?.display_name || partner?.email || t("partnerFallback");

  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Heart className="size-4" />
          {t("title")}
        </h3>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : partnership ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground">{t("pairedWith", { name: partnerLabel })}</p>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t("labelField")}</span>
              <div className="flex gap-2">
                <Input
                  className="h-9 flex-1 rounded-xl"
                  placeholder={t("labelPlaceholder")}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={60}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 shrink-0 rounded-xl"
                  disabled={labelSaving || label.trim() === (partnership.label ?? "")}
                  onClick={() => void saveLabel()}
                >
                  {labelSaving ? t("labelSaving") : t("labelSave")}
                </Button>
              </div>
            </div>

            <Button
              type="button"
              variant="destructive"
              className="w-fit rounded-xl"
              onClick={() => setConfirmAction({ type: "unpair" })}
            >
              {t("unpair")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t("unpairedHint")}</p>

            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleInvite}>
              <Input
                type="email"
                className="h-11 flex-1 rounded-xl"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button
                type="submit"
                size="lg"
                className="h-11 rounded-xl px-5"
                disabled={submitting || !email.trim()}
              >
                {submitting ? t("sending") : t("submit")}
              </Button>
            </form>

            {inviteUrl && (
              <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
                <span className="flex-1 truncate text-xs text-muted-foreground">{inviteUrl}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 rounded-lg"
                  onClick={() => void copyLink()}
                >
                  {copied ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <Copy className="size-3.5" aria-hidden />
                  )}
                  {copied ? t("copied") : t("copyLink")}
                </Button>
              </div>
            )}

            {pendingInvites.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("waitingHeading")}
                </span>
                <ul className="flex flex-col gap-1.5">
                  {pendingInvites.map((invite) => (
                    <li
                      key={invite.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-1.5"
                    >
                      <span className="truncate text-sm text-foreground">{invite.email}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge variant="secondary">{t("pendingBadge")}</Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          aria-label={t("cancelInviteLabel", { email: invite.email })}
                          onClick={() =>
                            setConfirmAction({
                              type: "revoke_invite",
                              inviteId: invite.id,
                              email: invite.email,
                            })
                          }
                        >
                          <X className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <Dialog
        open={confirmAction !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfirmAction(null);
        }}
      >
        <DialogContent className="rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {confirmAction?.type === "unpair"
                ? t("unpairTitle")
                : t("cancelInviteTitle", { email: confirmAction?.email ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "unpair"
                ? t("unpairDescription")
                : t("cancelInviteDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="destructive"
              className="h-11 rounded-xl"
              disabled={actionPending}
              onClick={() => void handleConfirmAction()}
            >
              {actionPending
                ? t("removing")
                : confirmAction?.type === "unpair"
                  ? t("unpairConfirm")
                  : t("cancelInviteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
