"use client";

import { isWishlist } from "@/lib/list-types";
import type { Item, ItemImage, ListMember, Profile } from "@/lib/types";
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
  initialItems: Item[];
  initialImages?: ItemImage[];
  members: MemberWithProfile[];
};

export function ItemList({
  listId,
  listType,
  listOwnerId,
  currentUserId,
  initialItems,
  initialImages = [],
  members,
}: ItemListProps) {
  if (isWishlist(listType)) {
    return (
      <WishlistItemList
        listId={listId}
        listOwnerId={listOwnerId}
        currentUserId={currentUserId}
        initialItems={initialItems}
        initialImages={initialImages}
        members={members}
      />
    );
  }

  return (
    <ShoppingItemList
      listId={listId}
      currentUserId={currentUserId}
      initialItems={initialItems}
      members={members}
    />
  );
}
