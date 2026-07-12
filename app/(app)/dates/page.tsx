import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { displayNameFor } from "@/lib/display-name";
import type { Occasion } from "@/lib/types";
import { AppBar } from "@/components/app-bar";
import { AppBarActions } from "@/components/app-bar-actions";
import { DatesList } from "@/components/dates-list";
import { EmptyState } from "@/components/empty-state";

type WishlistRow = {
  id: string;
  name: string;
  list_members: { user_id: string }[];
};

export default async function DatesPage() {
  const { userId } = await auth();
  const t = await getTranslations("dates");
  const tCommon = await getTranslations("common");

  const supabase = await createClient();

  const { data: pid } = await supabase.rpc("active_partnership_id");

  if (!pid || !userId) {
    return (
      <>
        <AppBar>
          <AppBarActions />
        </AppBar>
        <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 p-4 pb-bottom-nav">
          <Link
            href="/us"
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            {t("backToUs")}
          </Link>
          <EmptyState icon="💌" title={t("unpairedTitle")} description={t("unpairedBody")} />
        </main>
      </>
    );
  }

  const { data: partnerId } = await supabase.rpc("active_partner_id");

  const [{ data: occasionRows }, { data: profileRows }, { data: wishlistRows }] = await Promise.all([
    supabase.from("occasions").select("*").order("occasion_date", { ascending: true }),
    partnerId
      ? supabase.from("profiles").select("id, display_name, email, username").eq("id", partnerId)
      : Promise.resolve({ data: null }),
    supabase.from("lists").select("id, name, list_members(user_id)").eq("type", "wishlist"),
  ]);

  const partnerProfile = profileRows?.[0];
  const members = [
    { userId, label: t("you") },
    ...(partnerId
      ? [
          {
            userId: partnerId,
            label: displayNameFor(partnerProfile, tCommon("unknown")),
          },
        ]
      : []),
  ];

  const wishlists = partnerId
    ? ((wishlistRows ?? []) as unknown as WishlistRow[])
        .filter((l) => l.list_members.some((m) => m.user_id === partnerId))
        .map((l) => ({ id: l.id, name: l.name }))
    : [];

  return (
    <>
      <AppBar>
        <AppBarActions />
      </AppBar>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 p-4 pb-bottom-nav">
        <Link
          href="/us"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {t("backToUs")}
        </Link>
        <DatesList
          partnershipId={pid}
          initialOccasions={(occasionRows ?? []) as Occasion[]}
          members={members}
          wishlists={wishlists}
          currentUserId={userId}
        />
      </main>
    </>
  );
}
