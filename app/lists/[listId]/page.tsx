import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@clerk/nextjs/server";

import { createClient } from "@/lib/supabase/server";
import { getListTypeMeta } from "@/lib/list-types";
import { buildMemberColorMap } from "@/lib/member-colors";
import type { Item, ItemImage, List, ListMember, Profile } from "@/lib/types";
import { ItemList } from "@/components/item-list";
import { AppBar } from "@/components/app-bar";
import { AppBarActions } from "@/components/app-bar-actions";
import { MemberAvatar, initialsFor } from "@/components/member-avatar";
import { InvitePanel } from "@/components/invite-panel";
import { ListDetailLiveSync } from "@/components/list-detail-live-sync";

type MemberWithProfile = ListMember & {
  profiles: Pick<Profile, "id" | "email" | "display_name"> | null;
};

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;

  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const t = await getTranslations("listDetail");
  const tListTypes = await getTranslations("listTypes");

  const supabase = await createClient();

  await supabase.rpc("accept_pending_invites");

  const [{ data: list }, { data: items }, { data: members }] =
    await Promise.all([
      supabase.from("lists").select("*").eq("id", listId).maybeSingle(),
      supabase
        .from("items")
        .select("*")
        .eq("list_id", listId)
        .order("created_at", { ascending: true }),
      supabase
        .from("list_members")
        .select("list_id, user_id, role, created_at, profiles(id, email, display_name)")
        .eq("list_id", listId),
    ]);

  if (!list) {
    redirect("/no-access");
  }

  const typedList = list as List;
  const meta = getListTypeMeta(typedList.type, (key) => tListTypes(key));
  const typedMembers = (members ?? []) as unknown as MemberWithProfile[];
  const typedItems = (items ?? []) as Item[];
  const colorMap = buildMemberColorMap(typedMembers);

  let initialImages: ItemImage[] = [];
  if (typedItems.length > 0) {
    const { data: imageRows } = await supabase
      .from("item_images")
      .select("*")
      .in(
        "item_id",
        typedItems.map((item) => item.id),
      )
      .order("sort_order");
    initialImages = (imageRows ?? []) as ItemImage[];
  }

  return (
    <>
      <ListDetailLiveSync listId={typedList.id} />
      <AppBar>
        <AppBarActions />
      </AppBar>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 px-4 pb-safe pt-4">
        <Link
          href="/lists"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {t("backToLists")}
        </Link>

        <div className="flex items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-xl"
            aria-hidden
          >
            {meta.icon}
          </span>
          <div className="flex flex-1 flex-col gap-0.5">
            <h1 className="font-display text-lg font-semibold text-foreground">
              {typedList.name}
            </h1>
            <span className="text-xs text-muted-foreground">{meta.label}</span>
          </div>
          {typedMembers.length > 0 && (
            <div
              className="flex shrink-0 -space-x-2"
              aria-label={t("memberCount", { count: typedMembers.length })}
            >
              {typedMembers.map((member) => {
                const color = colorMap.get(member.user_id);
                if (!color) return null;
                const name = member.profiles?.display_name || member.profiles?.email || "?";
                return (
                  <MemberAvatar
                    key={member.user_id}
                    initials={initialsFor(member.profiles)}
                    color={color}
                    title={name}
                  />
                );
              })}
            </div>
          )}
        </div>

        <InvitePanel
          listId={typedList.id}
          listName={typedList.name}
          ownerId={typedList.owner_id}
          currentUserId={userId}
          members={typedMembers}
        />

        <ItemList
          listId={typedList.id}
          listType={typedList.type}
          listOwnerId={typedList.owner_id}
          currentUserId={userId}
          initialItems={typedItems}
          initialImages={initialImages}
          members={typedMembers}
        />
      </main>
    </>
  );
}
