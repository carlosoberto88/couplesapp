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

  return (
    <>
      <Suspense fallback={null}>
        <OnboardingGate />
      </Suspense>
      {children}
      <TabShell />
    </>
  );
}
