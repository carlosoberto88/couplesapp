import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import { createClient } from "@/lib/supabase/server";
import { ProvisioningError } from "@/components/provisioning-error";
import { OnboardingWizard } from "@/components/onboarding-wizard";

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

  const { error: acceptErr } = await supabase.rpc("accept_pending_invites");

  if (acceptErr) {
    return <ProvisioningError message={acceptErr.message} />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", userId)
    .single();

  return (
    <>
      <OnboardingWizard
        key={profile?.onboarding_completed_at ?? "pending"}
        show={!profile?.onboarding_completed_at}
      />
      {children}
    </>
  );
}
