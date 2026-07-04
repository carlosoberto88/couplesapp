import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import { createClient } from "@/lib/supabase/server";

export default async function ListsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const email = sessionClaims.email;

  if (!email) {
    throw new Error(
      "Clerk session token is missing the `email` claim — add it in Clerk Dashboard → Sessions → Customize session token",
    );
  }

  const supabase = await createClient();

  const { error: upsertErr } = await supabase
    .from("profiles")
    .upsert({ id: userId, email: email.toLowerCase() }, { onConflict: "id" });

  if (upsertErr) {
    throw new Error(
      "Profile provisioning failed — is migration 0003 applied and the Clerk↔Supabase integration connected? " +
        upsertErr.message,
    );
  }

  const { error: acceptErr } = await supabase.rpc("accept_pending_invites");

  if (acceptErr) {
    throw new Error(
      "Failed to accept pending invites — is migration 0003 applied and the Clerk↔Supabase integration connected? " +
        acceptErr.message,
    );
  }

  return <>{children}</>;
}
