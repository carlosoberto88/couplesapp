"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import { useTheme } from "next-themes";

import { clerkAppearance } from "@/lib/clerk-appearance";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AccountSection() {
  const { user, isLoaded } = useUser();
  const { resolvedTheme } = useTheme();

  if (!isLoaded) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex items-center gap-3 py-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-center gap-3 py-4">
        <UserButton appearance={clerkAppearance(resolvedTheme === "dark")} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">
            {user?.username ?? user?.fullName ?? user?.primaryEmailAddress?.emailAddress}
          </span>
          {user?.primaryEmailAddress ? (
            <span className="truncate text-sm text-muted-foreground">
              {user.primaryEmailAddress.emailAddress}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
