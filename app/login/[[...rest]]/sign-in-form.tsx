"use client";

import { SignIn } from "@clerk/nextjs";
import { useTheme } from "next-themes";

import { clerkAppearance } from "@/lib/clerk-appearance";

export function SignInForm({
  email,
  redirectUrl,
}: {
  email?: string;
  redirectUrl: string;
}) {
  const { resolvedTheme } = useTheme();

  return (
    <SignIn
      routing="path"
      path="/login"
      signUpUrl="/signup"
      forceRedirectUrl={redirectUrl}
      initialValues={email ? { emailAddress: email } : undefined}
      appearance={clerkAppearance(resolvedTheme === "dark")}
    />
  );
}
