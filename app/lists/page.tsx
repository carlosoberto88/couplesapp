import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";

import { createClient } from "@/lib/supabase/server";
import { getListTypeMeta } from "@/lib/list-types";
import { DUO_PALETTE } from "@/lib/member-colors";
import { clerkAppearance } from "@/lib/clerk-appearance";
import type { List } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { AppBar } from "@/components/app-bar";
import { CreateListDialog } from "@/components/create-list-dialog";
import { ListSettingsMenu } from "@/components/list-settings-menu";
import { ListsLiveSync } from "@/components/lists-live-sync";
import { cn } from "@/lib/utils";

type ListRow = List & { list_members: { count: number }[] };

export default async function ListsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const showArchived = filter === "archived";

  const { userId } = await auth();
  const t = await getTranslations("lists");
  const tListTypes = await getTranslations("listTypes");

  const supabase = await createClient();

  const { data: lists } = await supabase
    .from("lists")
    .select("id, name, type, owner_id, archived_at, created_at, list_members(count)")
    .order("created_at", { ascending: false });

  const rows = (lists ?? []) as ListRow[];
  const activeLists = rows.filter((l) => l.archived_at === null);
  const archivedLists = rows.filter((l) => l.archived_at !== null);
  const visibleLists = showArchived ? archivedLists : activeLists;

  return (
    <>
      <ListsLiveSync userId={userId} />
      <AppBar>
        <CreateListDialog />
        <UserButton appearance={clerkAppearance} />
      </AppBar>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-6 p-4">
        <div
          className="inline-flex w-fit items-center gap-1 rounded-full bg-muted p-1 text-sm"
          role="group"
          aria-label={t("filterLabel")}
        >
          <Link href="/lists" prefetch={false}>
            <span
              className={cn(
                "flex h-9 items-center rounded-full px-4 font-medium transition-colors",
                showArchived
                  ? "text-muted-foreground hover:text-foreground"
                  : "bg-duo-coral-tint text-primary",
              )}
            >
              {t("active")}
            </span>
          </Link>
          <Link href="/lists?filter=archived" prefetch={false}>
            <span
              className={cn(
                "flex h-9 items-center rounded-full px-4 font-medium transition-colors",
                showArchived
                  ? "bg-duo-coral-tint text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("archived")}
            </span>
          </Link>
        </div>

        {visibleLists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="font-display text-base font-semibold text-foreground">
              {showArchived ? t("emptyArchivedTitle") : t("emptyActiveTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {showArchived
                ? t("emptyArchivedDescription")
                : t("emptyActiveDescription")}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {visibleLists.map((list) => {
              const meta = getListTypeMeta(list.type, (key) => tListTypes(key));
              const memberCount = list.list_members?.[0]?.count ?? 0;
              const isOwner = list.owner_id === userId;
              const dotCount = Math.min(memberCount, 3);
              const extra = memberCount - dotCount;

              return (
                <li key={list.id}>
                  <Card className="relative rounded-2xl">
                    <CardContent className="flex min-h-11 items-center gap-4 py-1">
                      <Link
                        href={`/lists/${list.id}`}
                        className="flex flex-1 items-center gap-4 py-2.5"
                      >
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
                          <div
                            className="flex shrink-0 items-center gap-1"
                            aria-label={t("memberCount", { count: memberCount })}
                          >
                            <div className="flex -space-x-1.5">
                              {Array.from({ length: dotCount }).map((_, i) => (
                                <span
                                  key={i}
                                  className="size-3 rounded-full ring-2 ring-card"
                                  style={{
                                    backgroundColor:
                                      DUO_PALETTE[i % DUO_PALETTE.length].color,
                                  }}
                                />
                              ))}
                            </div>
                            {extra > 0 && (
                              <span className="text-xs font-medium text-muted-foreground">
                                +{extra}
                              </span>
                            )}
                          </div>
                        )}
                      </Link>
                      {isOwner && <ListSettingsMenu list={list} />}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
