import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import { createClient } from "@/lib/supabase/server";
import { ProvisioningError } from "@/components/provisioning-error";
import { OnboardingGate } from "@/components/onboarding-gate";
import { TabShell } from "@/components/tab-shell";

export async function AuthenticatedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const email = sessionClaims?.email;
  const username = sessionClaims?.username;

  if (!email) {
    return <ProvisioningError />;
  }

  const supabase = await createClient();

  const baseProfile = { id: userId, email: email.toLowerCase() };

  let { error: upsertErr } = await supabase.from("profiles").upsert(
    { ...baseProfile, ...(username ? { username } : {}) },
    { onConflict: "id" },
  );

  // username is a denormalized cache, not essential: if it collides with another
  // user's username under the DB's case-insensitive unique index, drop it and
  // retry so the profile is still provisioned instead of locking the user out.
  if (upsertErr && username && upsertErr.code === "23505") {
    ({ error: upsertErr } = await supabase
      .from("profiles")
      .upsert(baseProfile, { onConflict: "id" }));
  }

  if (upsertErr) {
    return <ProvisioningError message={upsertErr.message} />;
  }

  await supabase.rpc("accept_pending_partner_invites");

  return (
    <>
      <Suspense fallback={null}>
        <OnboardingGate />
      </Suspense>
      <div className="flex flex-1 flex-col md:[background:var(--app-backdrop)]">
        <div className="flex flex-1 flex-col md:mx-auto md:w-full md:max-w-[var(--app-frame)] md:border-x md:border-border md:bg-background md:shadow-[0_0_60px_-15px_var(--app-frame-shadow)]">
          {children}
        </div>
      </div>
      <TabShell />
    </>
  );
}
