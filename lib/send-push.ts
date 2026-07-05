import { createClient as createServerClient } from "@supabase/supabase-js";

import { configureWebPush, webpush } from "@/lib/web-push";

export type SendPushOptions = {
  userIds: string[];
  title: string;
  body: string;
  url: string;
};

export async function sendPushToUserIds({
  userIds,
  title,
  body,
  url,
}: SendPushOptions): Promise<{ sent: number }> {
  if (userIds.length === 0) return { sent: 0 };

  configureWebPush();

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", userIds);

  const notificationPayload = JSON.stringify({ title, body, url });

  let sent = 0;
  const staleEndpoints: string[] = [];

  for (const sub of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        notificationPayload,
      );
      sent++;
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode: number }).statusCode
          : null;
      if (statusCode === 404 || statusCode === 410) {
        staleEndpoints.push(sub.endpoint);
      }
    }
  }

  if (staleEndpoints.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
  }

  return { sent };
}
