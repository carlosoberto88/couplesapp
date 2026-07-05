"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Mail, Check, Copy, ChevronDown, UserMinus, X } from "lucide-react";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import type { ListMember, Profile } from "@/lib/types";
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
import { cn } from "@/lib/utils";

type InviteResponse = {
  status?:
    | "invited_email_sent"
    | "invited_copy_link"
    | "invited_push_sent"
    | "already_member"
    | "email_failed";
  inviteUrl?: string;
  error?: string;
};

type PendingInvite = {
  id: string;
  email: string;
};

type MemberWithProfile = ListMember & {
  profiles: Pick<Profile, "id" | "email" | "display_name"> | null;
};

type ConfirmAction =
  | { type: "remove_member"; userId: string; label: string }
  | { type: "revoke_invite"; inviteId: string; email: string };

export function InvitePanel({
  listId,
  listName,
  ownerId,
  currentUserId,
  members,
}: {
  listId: string;
  listName: string;
  ownerId: string;
  currentUserId: string;
  members: MemberWithProfile[];
}) {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const t = useTranslations("invite");
  const tCommon = useTranslations("common");
  const isOwner = currentUserId === ownerId;

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [copyLinkHint, setCopyLinkHint] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    supabase
      .from("list_invites")
      .select("id, email")
      .eq("list_id", listId)
      .eq("status", "pending")
      .then(({ data }) => {
        if (!cancelled) setPendingInvites((data as PendingInvite[]) ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [open, listId, supabase]);

  function memberLabel(member: MemberWithProfile) {
    return member.profiles?.display_name || member.profiles?.email || tCommon("unknown");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setInviteUrl(null);
    setCopyLinkHint(false);

    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId, email: trimmed }),
      });
      const data: InviteResponse = await res.json().catch(() => ({}));

      if (res.ok && data.status === "already_member") {
        toast.info(t("alreadyMember", { email: trimmed }));
        setEmail("");
        return;
      }

      if (res.ok && data.status === "invited_email_sent") {
        toast.success(t("emailSent", { email: trimmed }));
        setInviteUrl(data.inviteUrl ?? null);
        setEmail("");
        setPendingInvites((prev) =>
          prev.some((i) => i.email === trimmed)
            ? prev
            : [...prev, { id: `optimistic-${trimmed}`, email: trimmed }],
        );
        return;
      }

      if (res.ok && data.status === "invited_copy_link") {
        toast.info(t("copyLinkToast", { email: trimmed }));
        setInviteUrl(data.inviteUrl ?? null);
        setCopyLinkHint(true);
        setEmail("");
        setPendingInvites((prev) =>
          prev.some((i) => i.email === trimmed)
            ? prev
            : [...prev, { id: `optimistic-${trimmed}`, email: trimmed }],
        );
        return;
      }

      if (res.ok && data.status === "invited_push_sent") {
        toast.success(t("pushSent", { email: trimmed }));
        setInviteUrl(data.inviteUrl ?? null);
        setCopyLinkHint(false);
        setEmail("");
        setPendingInvites((prev) =>
          prev.some((i) => i.email === trimmed)
            ? prev
            : [...prev, { id: `optimistic-${trimmed}`, email: trimmed }],
        );
        return;
      }

      if (res.status === 502 && data.status === "email_failed") {
        toast.error(t("emailFailed"));
        setInviteUrl(data.inviteUrl ?? null);
        setPendingInvites((prev) =>
          prev.some((i) => i.email === trimmed)
            ? prev
            : [...prev, { id: `optimistic-${trimmed}`, email: trimmed }],
        );
        setEmail("");
        return;
      }

      toast.error(data.error ?? t("sendError"));
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

  async function handleConfirmAction() {
    if (!confirmAction) return;

    setActionPending(true);

    if (confirmAction.type === "remove_member") {
      const { error } = await supabase
        .from("list_members")
        .delete()
        .eq("list_id", listId)
        .eq("user_id", confirmAction.userId);

      setActionPending(false);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(t("removedMember", { name: confirmAction.label }));
      setConfirmAction(null);
      router.refresh();
      return;
    }

    const { error } = await supabase
      .from("list_invites")
      .update({ status: "revoked" })
      .eq("id", confirmAction.inviteId)
      .eq("status", "pending");

    setActionPending(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setPendingInvites((prev) =>
      prev.filter((invite) => invite.id !== confirmAction.inviteId),
    );
    toast.success(t("cancelledInvite", { email: confirmAction.email }));
    setConfirmAction(null);
  }

  return (
    <>
      <div className="rounded-2xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
            <Mail className="size-4 text-primary" aria-hidden />
            {t("panelTitle", { listName })}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        {open && (
          <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
            {members.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("membersHeading")}
                </span>
                <ul className="flex flex-col gap-1.5">
                  {members.map((member) => {
                    const label = memberLabel(member);
                    const canRemove =
                      isOwner &&
                      member.role === "member" &&
                      member.user_id !== ownerId;

                    return (
                      <li
                        key={member.user_id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-1.5"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm text-foreground">
                            {label}
                          </span>
                          {member.profiles?.display_name &&
                            member.profiles.email && (
                              <span className="truncate text-xs text-muted-foreground">
                                {member.profiles.email}
                              </span>
                            )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge variant="secondary">
                            {member.role === "owner"
                              ? t("ownerBadge")
                              : t("memberBadge")}
                          </Badge>
                          {canRemove && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              aria-label={t("removeMemberLabel", { name: label })}
                              onClick={() =>
                                setConfirmAction({
                                  type: "remove_member",
                                  userId: member.user_id,
                                  label,
                                })
                              }
                            >
                              <UserMinus className="size-3.5" aria-hidden />
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={handleSubmit}
            >
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
              <div className="flex flex-col gap-1.5">
                {copyLinkHint && (
                  <span className="text-xs text-muted-foreground">
                    {t("copyLinkHint")}
                  </span>
                )}
                <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
                  <span className="flex-1 truncate text-xs text-muted-foreground">
                    {inviteUrl}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 rounded-lg"
                    onClick={copyLink}
                  >
                    {copied ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : (
                      <Copy className="size-3.5" aria-hidden />
                    )}
                    {copied ? t("copied") : t("copyLink")}
                  </Button>
                </div>
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
                      <span className="truncate text-sm text-foreground">
                        {invite.email}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge variant="secondary">{t("pendingBadge")}</Badge>
                        {isOwner && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            aria-label={t("cancelInviteLabel", {
                              email: invite.email,
                            })}
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
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
              {confirmAction?.type === "remove_member"
                ? t("removeMemberTitle", { name: confirmAction.label })
                : t("cancelInviteTitle", { email: confirmAction?.email ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "remove_member"
                ? t("removeMemberDescription")
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
                : confirmAction?.type === "remove_member"
                  ? t("removeMemberConfirm")
                  : t("cancelInviteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
