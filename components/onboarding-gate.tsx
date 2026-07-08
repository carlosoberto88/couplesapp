import { auth } from "@clerk/nextjs/server";

import { ONBOARDING_VERSION } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export async function OnboardingGate() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at, onboarding_version")
    .eq("id", userId)
    .single();

  return (
    <OnboardingWizard
      key={profile?.onboarding_version ?? "pending"}
      show={(profile?.onboarding_version ?? 0) < ONBOARDING_VERSION}
    />
  );
}
