"use client";

import { isWishlist } from "@/lib/list-types";
import type { Item, ItemImage, ItemReaction, ListMember, Profile } from "@/lib/types";
import { ShoppingItemList } from "@/components/shopping-item-list";
import { WishlistItemList } from "@/components/wishlist-item-list";

type MemberWithProfile = ListMember & {
  profiles: Pick<Profile, "id" | "email" | "display_name"> | null;
};

type ItemListProps = {
  listId: string;
  listType: string;
  listOwnerId: string;
  currentUserId: string;
  listShareToken?: string | null;
  initialItems: Item[];
  initialImages?: ItemImage[];
  initialReactions?: ItemReaction[];
  members: MemberWithProfile[];
  listRecurring?: boolean;
};

export function ItemList({
  listId,
  listType,
  listOwnerId,
  currentUserId,
  listShareToken = null,
  initialItems,
  initialImages = [],
  initialReactions = [],
  members,
  listRecurring = false,
}: ItemListProps) {
  if (isWishlist(listType)) {
    return (
      <WishlistItemList
        listId={listId}
        listOwnerId={listOwnerId}
        currentUserId={currentUserId}
        listShareToken={listShareToken}
        initialItems={initialItems}
        initialImages={initialImages}
        initialReactions={initialReactions}
        members={members}
      />
    );
  }

  return (
    <ShoppingItemList
      listId={listId}
      listType={listType}
      listOwnerId={listOwnerId}
      currentUserId={currentUserId}
      initialItems={initialItems}
      initialImages={initialImages}
      initialReactions={initialReactions}
      members={members}
      listRecurring={listRecurring}
    />
  );
}
