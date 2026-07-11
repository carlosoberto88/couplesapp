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
