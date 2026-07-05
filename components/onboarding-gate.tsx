import { auth } from "@clerk/nextjs/server";

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
    .select("onboarding_completed_at")
    .eq("id", userId)
    .single();

  return (
    <OnboardingWizard
      key={profile?.onboarding_completed_at ?? "pending"}
      show={!profile?.onboarding_completed_at}
    />
  );
}
