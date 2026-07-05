"use client";

import { useLinkStatus } from "next/link";

import { cn } from "@/lib/utils";

type LinkPendingIndicatorProps = {
  className?: string;
  variant?: "dot" | "overlay";
};

export function LinkPendingIndicator({
  className,
  variant = "dot",
}: LinkPendingIndicatorProps) {
  const { pending } = useLinkStatus();

  if (variant === "overlay") {
    return (
      <span
        aria-hidden
        className={cn(
          "link-pending-overlay pointer-events-none absolute inset-0 rounded-2xl bg-background/45 transition-opacity duration-150",
          pending ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn("link-pending-dot", pending && "is-pending", className)}
    />
  );
}
