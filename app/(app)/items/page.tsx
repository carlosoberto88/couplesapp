import { auth } from "@clerk/nextjs/server";

import { createClient } from "@/lib/supabase/server";
import { isWishlist } from "@/lib/list-types";
import type { ItemImage, ItemWithList, ListMember, Profile } from "@/lib/types";
import { AppBar } from "@/components/app-bar";
import { AppBarActions } from "@/components/app-bar-actions";
import { AllItemsFilter } from "@/components/all-items-filter";
import { AllItemsView } from "@/components/all-items-view";
import type { AllItemsStatus } from "@/lib/all-items-utils";

type MemberWithProfile = ListMember & {
  profiles: Pick<Profile, "id" | "email" | "display_name"> | null;
};

export default async function AllItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const status: AllItemsStatus = statusParam === "done" ? "done" : "pending";

  const { userId } = await auth();
  if (!userId) return null;

  const supabase = await createClient();

  const { data: itemRows } = await supabase
    .from("items")
    .select("*, lists!inner(id, name, type, owner_id, archived_at)")
    .is("lists.archived_at", null)
    .is("removed_at", null)
    .order("created_at", { ascending: true });

  const items = (itemRows ?? []) as ItemWithList[];
  const listIds = [...new Set(items.map((item) => item.lists.id))];

  let initialImages: ItemImage[] = [];
  const wishlistItemIds = items
    .filter((item) => isWishlist(item.lists.type))
    .map((item) => item.id);

  if (wishlistItemIds.length > 0) {
    const { data: imageRows } = await supabase
      .from("item_images")
      .select("*")
      .in("item_id", wishlistItemIds)
      .order("sort_order");
    initialImages = (imageRows ?? []) as ItemImage[];
  }

  const membersByListId: Record<string, MemberWithProfile[]> = {};

  if (listIds.length > 0) {
    const { data: memberRows } = await supabase
      .from("list_members")
      .select("list_id, user_id, role, created_at, profiles(id, email, display_name)")
      .in("list_id", listIds);

    for (const row of (memberRows ?? []) as unknown as MemberWithProfile[]) {
      const bucket = membersByListId[row.list_id] ?? [];
      bucket.push(row);
      membersByListId[row.list_id] = bucket;
    }
  }

  return (
    <>
      <AppBar>
        <AppBarActions />
      </AppBar>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 p-4 pb-bottom-nav">
        <AllItemsFilter showDone={status === "done"} />
        <AllItemsView
          currentUserId={userId}
          initialItems={items}
          initialImages={initialImages}
          membersByListId={membersByListId}
          status={status}
        />
      </main>
    </>
  );
}
