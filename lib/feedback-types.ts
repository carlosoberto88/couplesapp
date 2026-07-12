export type FeedbackSubmission = {
  id: string;
  user_id: string;
  type: "suggestion" | "bug";
  message: string;
  page_url: string | null;
  user_agent: string | null;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
  profiles: {
    email: string;
    display_name: string | null;
    username: string | null;
  } | null;
};

type FeedbackRow = Omit<FeedbackSubmission, "profiles"> & {
  profiles:
    | FeedbackSubmission["profiles"]
    | NonNullable<FeedbackSubmission["profiles"]>[]
    | null;
};

export function normalizeFeedbackRows(rows: FeedbackRow[] | null): FeedbackSubmission[] {
  return (rows ?? []).map((row) => ({
    ...row,
    profiles: Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : row.profiles,
  }));
}
