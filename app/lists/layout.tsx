import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import { createClient } from "@/lib/supabase/server";
import { ProvisioningError } from "@/components/provisioning-error";

export default async function ListsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const email = sessionClaims?.email;

  if (!email) {
    return <ProvisioningError />;
  }

  const supabase = await createClient();

  const { error: upsertErr } = await supabase
    .from("profiles")
    .upsert({ id: userId, email: email.toLowerCase() }, { onConflict: "id" });

  if (upsertErr) {
    return <ProvisioningError message={upsertErr.message} />;
  }

  const { error: acceptErr } = await supabase.rpc("accept_pending_invites");

  if (acceptErr) {
    return <ProvisioningError message={acceptErr.message} />;
  }

  return <>{children}</>;
}
