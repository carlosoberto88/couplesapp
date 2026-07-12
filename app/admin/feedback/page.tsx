import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { normalizeFeedbackRows } from "@/lib/feedback-types";
import { FeedbackAdminList } from "@/components/feedback-admin-list";
import { getFeedbackServiceClient, isFeedbackAdmin } from "@/lib/feedback-admin";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function FeedbackAdminPage({ searchParams }: PageProps) {
  const { userId } = await auth();

  if (!isFeedbackAdmin(userId)) {
    redirect("/lists");
  }

  const { status: rawStatus } = await searchParams;
  const status =
    rawStatus === "resolved" || rawStatus === "all" ? rawStatus : "open";

  const admin = getFeedbackServiceClient();
  let query = admin
    .from("feedback_submissions")
    .select(
      "id, user_id, type, message, page_url, user_agent, status, created_at, resolved_at, profiles(email, display_name, username)",
    )
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const tabs = [
    { href: "/admin/feedback", label: "Open", value: "open" as const },
    { href: "/admin/feedback?status=resolved", label: "Resolved", value: "resolved" as const },
    { href: "/admin/feedback?status=all", label: "All", value: "all" as const },
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-foreground">Feedback</h1>
        <p className="text-sm text-muted-foreground">
          User suggestions and bug reports.
        </p>
      </div>

      <nav className="inline-flex w-fit gap-1 rounded-full bg-muted p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={tab.href}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              status === tab.value
                ? "bg-duo-coral-tint text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <FeedbackAdminList
        submissions={normalizeFeedbackRows(data)}
        status={status}
      />
    </main>
  );
}
