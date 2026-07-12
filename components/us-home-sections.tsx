import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getListTypeMeta, isWishlist } from "@/lib/list-types";
import { daysUntilOccasion, sortOccasionsByProximity } from "@/lib/occasion-utils";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { displayNameFor } from "@/lib/display-name";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ListCardLink } from "@/components/list-card-link";

type ListRow = { id: string; name: string; type: string };
type ItemRow = {
  list_id: string;
  checked_at: string | null;
  created_by: string;
  created_at: string;
  name: string;
};

const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cross-list "what's going on together" digest, shown below the paired
 * DuoRings hero on `/us`. Returns null for solo/pending users so they only
 * ever see the invite/waiting hero (Decision 1).
 */
export async function UsHomeSections() {
  const supabase = await createClient();

  const { data: partnershipId } = await supabase.rpc("active_partnership_id");
  if (!partnershipId) return null;

  const { data: partnerId } = await supabase.rpc("active_partner_id");
  const { data: partnerProfile } = partnerId
    ? await supabase.from("profiles").select("id, username, display_name, email").eq("id", partnerId).maybeSingle()
    : { data: null };

  const [
    { data: listRows },
    { data: itemRows },
    { data: occasionRows },
    t,
    tLists,
    tDates,
    tActivity,
    tListTypes,
    tUs,
    locale,
  ] = await Promise.all([
    supabase.from("lists").select("id, name, type").order("created_at", { ascending: false }),
    supabase
      .from("items")
      .select("list_id, checked_at, created_by, created_at, name")
      .is("removed_at", null),
    supabase.from("occasions").select("*"),
    getTranslations("home"),
    getTranslations("lists"),
    getTranslations("dates"),
    getTranslations("activity"),
    getTranslations("listTypes"),
    getTranslations("us"),
    getLocale(),
  ]);

  const lists = (listRows ?? []) as ListRow[];
  const items = (itemRows ?? []) as ItemRow[];
  const partnerName = displayNameFor(partnerProfile, tUs("partnerFallback"));

  const pendingByList = new Map<string, number>();
  for (const item of items) {
    if (item.checked_at === null) {
      pendingByList.set(item.list_id, (pendingByList.get(item.list_id) ?? 0) + 1);
    }
  }
  const pendingLists = lists
    .filter((list) => !isWishlist(list.type) && (pendingByList.get(list.id) ?? 0) > 0)
    .map((list) => ({ ...list, pendingCount: pendingByList.get(list.id) ?? 0 }));

  const today = new Date();
  const upcomingOccasions = sortOccasionsByProximity(occasionRows ?? [], today)
    .filter((occasion) => daysUntilOccasion(occasion.occasion_date, occasion.recurring, today) >= 0)
    .slice(0, 3);

  const activityCutoff = today.getTime() - ACTIVITY_WINDOW_MS;
  const recentPartnerItems = items
    .filter((item) => item.created_by === partnerId && new Date(item.created_at).getTime() > activityCutoff)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 4);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex w-full flex-col gap-2">
        <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("pendingHeading")}
        </h2>
        {pendingLists.length === 0 ? (
          <EmptyState icon="✅" title={t("pendingEmptyTitle")} description={t("pendingEmptyBody")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {pendingLists.map((list) => {
              const meta = getListTypeMeta(list.type, (key) => tListTypes(key));
              return (
                <li key={list.id}>
                  <Card className="rounded-2xl">
                    <CardContent className="flex min-h-11 items-center py-1">
                      <ListCardLink href={`/lists/${list.id}`}>
                        <span
                          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-xl"
                          aria-hidden
                        >
                          {meta.icon}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate font-display text-base font-semibold text-foreground">
                            {list.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {meta.label} · {tLists("pendingItems", { count: list.pendingCount })}
                          </span>
                        </div>
                      </ListCardLink>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {upcomingOccasions.length > 0 && (
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("occasionsHeading")}
            </h2>
            <Link
              href="/dates"
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("occasionsSeeAll")}
            </Link>
          </div>
          <ul className="flex flex-col gap-3">
            {upcomingOccasions.map((occasion) => {
              const days = daysUntilOccasion(occasion.occasion_date, occasion.recurring, today);
              return (
                <li key={occasion.id}>
                  <Card className="rounded-2xl">
                    <CardContent className="flex items-center justify-between gap-3 py-1">
                      <span className="truncate font-display text-base font-semibold text-foreground">
                        {occasion.label}
                      </span>
                      <Badge variant={days < 0 ? "outline" : days === 0 ? "default" : "secondary"}>
                        {days === 0
                          ? tDates("countdownToday")
                          : days < 0
                            ? tDates("countdownPassed")
                            : tDates("countdownDays", { days })}
                      </Badge>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {recentPartnerItems.length > 0 && (
        <div className="flex w-full flex-col gap-2">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("activityHeading", { name: partnerName })}
          </h2>
          <Card className="rounded-2xl">
            <CardContent className="flex flex-col divide-y divide-border py-0">
              {recentPartnerItems.map((item) => (
                <p key={`${item.list_id}-${item.name}-${item.created_at}`} className="py-2.5 text-sm text-foreground">
                  {tActivity("addedItems", {
                    user: partnerName,
                    items: item.name,
                    time: formatRelativeTime(item.created_at, locale),
                  })}
                </p>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
