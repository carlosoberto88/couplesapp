"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useUser } from "@clerk/nextjs";
import { Check, Copy, Heart, Pencil, Share2 } from "lucide-react";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { Partnership, PartnerInvite, Profile } from "@/lib/types";
import { displayNameFor } from "@/lib/display-name";
import { DuoRings } from "@/components/duo-rings";
import { initialsFor } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PartnerProfile = Pick<Profile, "id" | "display_name" | "email" | "username">;
type PendingInvite = Pick<PartnerInvite, "id" | "email" | "created_at">;

type InviteResponse = {
  status?: "invited_email_sent" | "invited_copy_link" | "invited_push_sent" | "email_failed";
  invite_id?: string;
  inviteUrl?: string;
  email?: string;
  error?: string;
};

type ConfirmAction = { type: "cancel_invite" } | { type: "unpair" };

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(dateStr));
}

function formatMonthYear(dateStr: string) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
    new Date(dateStr),
  );
}

function buildInviteUrl(email: string) {
  if (typeof window === "undefined") return null;
  return `${window.location.origin}/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent("/dates")}`;
}

export function UsSurface() {
  const supabase = useSupabaseClient();
  const { user } = useUser();
  const t = useTranslations("us");

  const [loading, setLoading] = useState(true);
  const [ownProfile, setOwnProfile] = useState<PartnerProfile | null>(null);
  const [partnership, setPartnership] = useState<Partnership | null>(null);
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const [label, setLabel] = useState("");
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelSaving, setLabelSaving] = useState(false);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setCanShare(typeof navigator.share === "function");
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    async function load() {
      try {
        const [{ data: ownRow }, { data: pid }] = await Promise.all([
          supabase.from("profiles").select("id, display_name, email, username").eq("id", user!.id).maybeSingle(),
          supabase.rpc("active_partnership_id"),
        ]);
        if (cancelled) return;
        setOwnProfile((ownRow as PartnerProfile) ?? null);

        if (!pid) {
          setPartnership(null);
          setPartner(null);

          const { data } = await supabase
            .from("partner_invites")
            .select("id, email, created_at")
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(1);
          if (cancelled) return;

          const invite = (data?.[0] as PendingInvite) ?? null;
          setPendingInvite(invite);
          setInviteUrl(invite ? buildInviteUrl(invite.email) : null);
          return;
        }

        setPendingInvite(null);

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
          .select("id, display_name, email, username")
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
  }, [supabase, t, user, user?.id]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = identifier.trim();
    if (!trimmed) return;

    setSubmitting(true);

    try {
      const res = await fetch("/api/partner-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: trimmed }),
      });
      const data: InviteResponse = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error ?? t("sendError"));
        return;
      }

      const resolvedEmail = data.email ?? trimmed;

      setIdentifier("");
      setInviteUrl(data.inviteUrl ?? buildInviteUrl(resolvedEmail));
      setPendingInvite({
        id: data.invite_id ?? `optimistic-${resolvedEmail}`,
        email: resolvedEmail,
        created_at: new Date().toISOString(),
      });

      if (data.status === "invited_push_sent") {
        toast.success(t("notifiedPush", { name: resolvedEmail }));
      } else if (data.status === "invited_email_sent") {
        toast.success(t("notifiedEmail", { name: resolvedEmail }));
      }
      // invited_copy_link / email_failed: no fake-success toast — the waiting
      // state below surfaces the copy-link affordance prominently instead.
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

  async function shareInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.share({ url: inviteUrl, title: t("shareTitle") });
    } catch {
      // User dismissed the native share sheet — not an error.
    }
  }

  async function saveLabel() {
    if (!partnership) return;
    const trimmed = label.trim();

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
    setEditingLabel(false);
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
      toast.success(t("unpaired"));
      setConfirmAction(null);
      return;
    }

    const { error } = await supabase
      .from("partner_invites")
      .update({ status: "revoked" })
      .eq("id", pendingInvite?.id ?? "")
      .eq("status", "pending");

    setActionPending(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(t("cancelledInvite", { name: pendingInvite?.email ?? "" }));
    setPendingInvite(null);
    setInviteUrl(null);
    setConfirmAction(null);
  }

  const yourName = displayNameFor(ownProfile, t("you"));
  const partnerName = displayNameFor(partner, t("partnerFallback"));

  return (
    <>
      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center gap-6 p-4 pb-bottom-nav">
        {loading ? (
          <p className="mt-12 text-sm text-muted-foreground">{t("loading")}</p>
        ) : partnership ? (
          <>
            <div className="flex w-full flex-col items-center gap-4 rounded-3xl bg-duo-gold-tint px-6 py-8">
              <DuoRings
                state="paired"
                partnerA={{ initials: initialsFor(ownProfile), name: yourName }}
                partnerB={{ initials: initialsFor(partner), name: partnerName }}
                size={72}
                label={
                  <button
                    type="button"
                    onClick={() => setEditingLabel(true)}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm"
                  >
                    {label || t("labelDefault")}
                  </button>
                }
              />
              <div className="flex flex-col items-center gap-1 text-center">
                <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                  {yourName} <span className="text-duo-gold">&</span> {partnerName}
                </h1>
                {partnership.created_at && (
                  <p className="text-sm text-muted-foreground">
                    {t("pairedCaption", { date: formatMonthYear(partnership.created_at) })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex w-full flex-col gap-2">
              <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("detailsHeading")}
              </h2>
              <div className="flex flex-col divide-y divide-border rounded-2xl bg-card ring-1 ring-foreground/10">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="shrink-0 text-sm text-muted-foreground">{t("labelField")}</span>
                  {editingLabel ? (
                    <div className="flex items-center gap-2">
                      <Input
                        autoFocus
                        className="h-8 w-32 rounded-lg text-sm"
                        placeholder={t("labelPlaceholder")}
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        maxLength={60}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 shrink-0 rounded-lg"
                        disabled={labelSaving}
                        onClick={() => void saveLabel()}
                      >
                        {labelSaving ? t("labelSaving") : t("labelSave")}
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingLabel(true)}
                      className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground"
                    >
                      {label || t("labelDefault")}
                      <Pencil className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  )}
                </div>
                {partnership.created_at && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-sm text-muted-foreground">{t("pairedSinceField")}</span>
                    <span className="text-sm font-medium text-foreground">
                      {formatDate(partnership.created_at)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmAction({ type: "unpair" })}
            >
              {t("unpair", { name: partnerName })}
            </Button>
          </>
        ) : pendingInvite ? (
          <>
            <DuoRings
              state="pending"
              partnerA={{ initials: initialsFor(ownProfile), name: yourName }}
              partnerB={{ initials: initialsFor({ display_name: null, email: pendingInvite.email }) }}
              size={72}
            />
            <h1 className="text-center font-display text-2xl font-bold text-foreground">
              {t("waitingHeadline", { name: pendingInvite.email })}
            </h1>

            <div className="flex w-full flex-col gap-2 rounded-2xl bg-duo-coral-tint px-4 py-3 text-sm text-foreground">
              <p>
                {t("waitingStatus", {
                  name: pendingInvite.email,
                  date: formatDate(pendingInvite.created_at),
                })}
              </p>
              <p className="text-muted-foreground">{t("waitingReassurance")}</p>
            </div>

            <div className="flex w-full flex-col gap-2.5">
              <Button
                type="button"
                className="h-12 rounded-xl bg-duo-teal text-white hover:bg-duo-teal/90"
                disabled={!inviteUrl}
                onClick={() => void copyLink()}
              >
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? t("copied") : t("copyInviteLink")}
              </Button>
              {canShare && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-xl"
                  onClick={() => void shareInvite()}
                >
                  <Share2 className="size-4" aria-hidden />
                  {t("shareAnotherWay")}
                </Button>
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmAction({ type: "cancel_invite" })}
            >
              {t("cancelInvite")}
            </Button>
          </>
        ) : (
          <>
            <DuoRings state="solo" partnerA={{ initials: initialsFor(ownProfile), name: yourName }} size={72} />
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="font-display text-2xl font-bold text-foreground">{t("soloHeadline")}</h1>
              <p className="max-w-[320px] text-sm text-muted-foreground">{t("soloSupporting")}</p>
            </div>

            <form onSubmit={handleInvite} className="flex w-full flex-col gap-3">
              <Input
                type="text"
                required
                autoCapitalize="none"
                autoCorrect="off"
                className="h-12 rounded-xl"
                placeholder={t("identifierPlaceholder")}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
              <Button
                type="submit"
                disabled={submitting}
                className="h-12 rounded-xl bg-duo-teal text-white hover:bg-duo-teal/90"
              >
                {submitting ? t("sending") : t("soloCta")}
                <Heart className="size-4" aria-hidden />
              </Button>
            </form>
            <p className="text-center text-xs text-muted-foreground">{t("soloCaption")}</p>
          </>
        )}
      </div>

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
                ? t("unpairTitle", { name: partnerName })
                : t("cancelInviteTitle")}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "unpair"
                ? t("unpairDescription")
                : t("cancelInviteDescription", { name: pendingInvite?.email ?? "" })}
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
