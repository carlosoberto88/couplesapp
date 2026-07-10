"use client";

import { SignUp } from "@clerk/nextjs";
import { useTheme } from "next-themes";

import { clerkAppearance } from "@/lib/clerk-appearance";

export function SignUpForm({
  email,
  redirectUrl,
}: {
  email?: string;
  redirectUrl: string;
}) {
  const { resolvedTheme } = useTheme();

  return (
    <SignUp
      routing="path"
      path="/signup"
      signInUrl="/login"
      forceRedirectUrl={redirectUrl}
      initialValues={email ? { emailAddress: email } : undefined}
      appearance={clerkAppearance(resolvedTheme === "dark")}
    />
  );
}
