import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { auth } from "@clerk/nextjs/server";

import { createClient } from "@/lib/supabase/server";
import { getListTypeMeta, isWishlist } from "@/lib/list-types";
import { buildMemberColorMap, UNKNOWN_MEMBER_COLOR } from "@/lib/member-colors";
import type { List, Profile } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { AppBar } from "@/components/app-bar";
import { AppBarActions } from "@/components/app-bar-actions";
import { CreateListDialog } from "@/components/create-list-dialog";
import { ListsEmptyActive } from "@/components/lists-empty-active";
import { EmptyState } from "@/components/empty-state";
import { ListSettingsMenu } from "@/components/list-settings-menu";
import { ListsLiveSync } from "@/components/lists-live-sync";
import { ListCardLink } from "@/components/list-card-link";
import { MemberAvatar, initialsFor } from "@/components/member-avatar";

type ListMemberWithProfile = {
  user_id: string;
  created_at: string;
  profiles: Pick<Profile, "id" | "email" | "display_name"> | null;
};

type ListRow = List & { list_members: ListMemberWithProfile[] };

export default async function ListsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; room?: string }>;
}) {
  const { filter, room: roomParam } = await searchParams;
  const showArchived = filter === "archived";
  const room = roomParam === "wishlist" ? "wishlist" : "shopping";
  const roomQuery = room === "wishlist" ? "room=wishlist" : "";
  const archivedHref = `/lists?${[roomQuery, "filter=archived"].filter(Boolean).join("&")}`;
  const activeHref = roomQuery ? `/lists?${roomQuery}` : "/lists";

  const { userId } = await auth();
  const t = await getTranslations("lists");
  const tListTypes = await getTranslations("listTypes");

  const supabase = await createClient();

  await supabase.rpc("accept_pending_invites");

  const { data: lists } = await supabase
    .from("lists")
    .select(
      "id, name, type, recurring, owner_id, archived_at, created_at, share_token, list_members(user_id, created_at, profiles(id, email, display_name))",
    )
    .order("created_at", { ascending: false });

  const rows = (lists ?? []) as unknown as ListRow[];
  const roomRows = rows.filter((l) => isWishlist(l.type) === (room === "wishlist"));
  const activeLists = roomRows.filter((l) => l.archived_at === null);
  const archivedLists = roomRows.filter((l) => l.archived_at !== null);
  const visibleLists = showArchived ? archivedLists : activeLists;

  return (
    <>
      <ListsLiveSync userId={userId} />
      <AppBar>
        <CreateListDialog />
        <AppBarActions />
      </AppBar>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 p-4 pb-bottom-nav">
        {visibleLists.length === 0 ? (
          showArchived ? (
            <EmptyState
              icon="📦"
              title={t("emptyArchivedTitle")}
              description={t("emptyArchivedDescription")}
            />
          ) : (
            <ListsEmptyActive />
          )
        ) : (
          <ul className="flex flex-col gap-3">
            {visibleLists.map((list) => {
              const meta = getListTypeMeta(list.type, (key) => tListTypes(key));
              const members = list.list_members ?? [];
              const memberCount = members.length;
              const isOwner = list.owner_id === userId;
              const dotCount = Math.min(memberCount, 3);
              const colorMap = buildMemberColorMap(members);
              const otherMember = members.find((m) => m.user_id !== userId);
              const otherName =
                otherMember?.profiles?.display_name || otherMember?.profiles?.email || "?";

              return (
                <li key={list.id}>
                  <Card className="relative rounded-2xl">
                    <CardContent className="flex min-h-11 items-center gap-4 py-1">
                      <ListCardLink href={`/lists/${list.id}`}>
                        <span
                          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-xl"
                          aria-hidden
                        >
                          {meta.icon}
                        </span>
                        <div className="flex flex-1 flex-col gap-0.5">
                          <span className="font-display text-base font-semibold text-foreground">
                            {list.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {meta.label}
                          </span>
                        </div>
                        {memberCount > 0 && (
                          <div className="flex shrink-0 flex-col items-end gap-0.5">
                            <div className="flex -space-x-1.5">
                              {members.slice(0, dotCount).map((member) => {
                                const color =
                                  colorMap.get(member.user_id) ?? UNKNOWN_MEMBER_COLOR;
                                const name =
                                  member.profiles?.display_name ||
                                  member.profiles?.email ||
                                  "?";
                                return (
                                  <MemberAvatar
                                    key={member.user_id}
                                    initials={initialsFor(member.profiles)}
                                    color={color}
                                    title={name}
                                    className="size-6 text-[10px]"
                                  />
                                );
                              })}
                            </div>
                            {memberCount >= 2 && (
                              <span className="text-xs font-medium text-muted-foreground">
                                {memberCount === 2
                                  ? t("membersYouAnd", { name: otherName })
                                  : t("membersCount", { count: memberCount })}
                              </span>
                            )}
                          </div>
                        )}
                      </ListCardLink>
                      {isOwner && <ListSettingsMenu list={list} />}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        {showArchived ? (
          <Link
            href={activeHref}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("active")}
          </Link>
        ) : (
          archivedLists.length > 0 && (
            <Link
              href={archivedHref}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("archivedCount", { count: archivedLists.length })}
            </Link>
          )
        )}
      </main>
    </>
  );
}
