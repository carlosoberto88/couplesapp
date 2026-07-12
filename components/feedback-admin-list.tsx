"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import type { FeedbackSubmission } from "@/lib/feedback-types";
import { displayNameFor } from "@/lib/display-name";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FeedbackAdminListProps = {
  submissions: FeedbackSubmission[];
  status: "open" | "resolved" | "all";
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function authorLabel(submission: FeedbackSubmission) {
  return displayNameFor(submission.profiles, submission.user_id);
}

export function FeedbackAdminList({ submissions, status }: FeedbackAdminListProps) {
  const router = useRouter();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  async function resolveSubmission(id: string) {
    setResolvingId(id);
    try {
      const response = await fetch(`/api/feedback/${id}`, { method: "PATCH" });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        toast.error(data?.error ?? "Could not resolve feedback");
        return;
      }

      toast.success("Marked as resolved");
      router.refresh();
    } finally {
      setResolvingId(null);
    }
  }

  if (submissions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No {status === "all" ? "" : status} feedback yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {submissions.map((submission) => (
        <li
          key={submission.id}
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={submission.type === "bug" ? "destructive" : "secondary"}>
                {submission.type === "bug" ? "Bug" : "Suggestion"}
              </Badge>
              {submission.status === "resolved" ? (
                <Badge variant="outline">Resolved</Badge>
              ) : null}
            </div>
            <time className="text-xs text-muted-foreground">
              {formatDate(submission.created_at)}
            </time>
          </div>

          <p className="mt-2 text-sm font-medium text-foreground">{authorLabel(submission)}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{submission.message}</p>

          {(submission.page_url || submission.user_agent) && (
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              {submission.page_url ? <p>Page: {submission.page_url}</p> : null}
              {submission.user_agent ? (
                <p className="line-clamp-2">Agent: {submission.user_agent}</p>
              ) : null}
            </div>
          )}

          {submission.status === "open" ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={cn("mt-3 rounded-xl")}
              disabled={resolvingId === submission.id}
              onClick={() => void resolveSubmission(submission.id)}
            >
              {resolvingId === submission.id ? "Resolving…" : "Mark resolved"}
            </Button>
          ) : submission.resolved_at ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Resolved {formatDate(submission.resolved_at)}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
