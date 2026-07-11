import { createClient as createServerClient } from "@supabase/supabase-js";

import { sendPushToUserIds } from "@/lib/send-push";

export type NotifyUsersOptions = {
  userIds: string[];
  type: string;
  title: string;
  body?: string;
  url?: string;
};

export async function notifyUsers({
  userIds,
  type,
  title,
  body,
  url,
}: NotifyUsersOptions): Promise<{ sent: number }> {
  if (userIds.length === 0) return { sent: 0 };

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { error } = await admin.from("notifications").insert(
    userIds.map((userId) => ({
      user_id: userId,
      type,
      title,
      body: body ?? null,
      url: url ?? null,
    })),
  );

  if (error) {
    console.warn("[notify] failed to write notification rows", {
      userIds,
      type,
      title,
      error,
    });
  }

  return sendPushToUserIds({ userIds, title, body: body ?? "", url: url ?? "" });
}
