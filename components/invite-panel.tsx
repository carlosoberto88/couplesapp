"use client";

import { useEffect, useState } from "react";
import { Mail, Check, Copy, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { useSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type InviteResponse = {
  status?:
    | "invited_email_sent"
    | "invited_copy_link"
    | "already_member"
    | "email_failed";
  inviteUrl?: string;
  error?: string;
};

type PendingInvite = {
  id: string;
  email: string;
};

export function InvitePanel({
  listId,
  listName,
}: {
  listId: string;
  listName: string;
}) {
  const supabase = useSupabaseClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [copyLinkHint, setCopyLinkHint] = useState(false);

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
        toast.info(`${trimmed} is already on this list`);
        setEmail("");
        return;
      }

      if (res.ok && data.status === "invited_email_sent") {
        toast.success(`Invitation email sent to ${trimmed}`);
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
        toast.info(
          `${trimmed} already has an account — copy this link and send it to them`,
        );
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

      if (res.status === 502 && data.status === "email_failed") {
        toast.error("Couldn't send the email — share this link instead");
        setInviteUrl(data.inviteUrl ?? null);
        setPendingInvites((prev) =>
          prev.some((i) => i.email === trimmed)
            ? prev
            : [...prev, { id: `optimistic-${trimmed}`, email: trimmed }],
        );
        setEmail("");
        return;
      }

      toast.error(data.error ?? "Could not send invite");
    } catch {
      toast.error("Could not send invite");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
          <Mail className="size-4 text-primary" aria-hidden />
          Invite to {listName}
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
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSubmit}>
            <Input
              type="email"
              className="h-11 flex-1 rounded-xl"
              placeholder="their@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <Button
              type="submit"
              size="lg"
              className="h-11 rounded-xl px-5"
              disabled={submitting || !email.trim()}
            >
              {submitting ? "Sending…" : "Invite"}
            </Button>
          </form>

          {inviteUrl && (
            <div className="flex flex-col gap-1.5">
              {copyLinkHint && (
                <span className="text-xs text-muted-foreground">
                  They already have an account — send them this link to join.
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
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
            </div>
          )}

          {pendingInvites.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Waiting to join
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
                    <Badge variant="secondary" className="shrink-0">
                      Pending
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
