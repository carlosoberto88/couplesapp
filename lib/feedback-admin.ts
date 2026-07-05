import { createClient as createServerClient } from "@supabase/supabase-js";

/**
 * Admin allowlist for feedback review. Set FEEDBACK_ADMIN_USER_IDS to a
 * comma-separated list of Clerk user ids (from Clerk Dashboard → Users).
 */
export function isFeedbackAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;

  const raw = process.env.FEEDBACK_ADMIN_USER_IDS?.trim();
  if (!raw) return false;

  const allowed = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return allowed.includes(userId);
}

export function getFeedbackServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
