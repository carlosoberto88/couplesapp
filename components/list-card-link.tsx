"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { LinkPendingIndicator } from "@/components/link-pending-indicator";

type ListCardLinkProps = {
  href: string;
  children: ReactNode;
};

export function ListCardLink({ href, children }: ListCardLinkProps) {
  return (
    <Link href={href} className="relative flex flex-1 items-center gap-4 py-2.5">
      <LinkPendingIndicator variant="overlay" />
      {children}
    </Link>
  );
}
