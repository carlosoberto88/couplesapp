export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
};

export type List = {
  id: string;
  name: string;
  type: string;
  owner_id: string;
  created_at: string;
  archived_at: string | null;
  recurring: boolean;
};

export type ListMember = {
  list_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
};

export type ListInvite = {
  id: string;
  list_id: string;
  email: string;
  invited_by: string;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
};

export type ItemPriority = "must_have" | "nice_to_have";

export type Item = {
  id: string;
  list_id: string;
  name: string;
  note: string | null;
  position: number;
  aisle: string | null;
  created_by: string;
  created_at: string;
  checked_at: string | null;
  checked_by: string | null;
  url: string | null;
  reserved_by: string | null;
  reserved_at: string | null;
  price: number | null;
  currency: string | null;
  priority: ItemPriority | null;
  is_extra: boolean;
  removed_at: string | null;
};

export type ItemImage = {
  id: string;
  item_id: string;
  storage_path: string;
  sort_order: number;
  created_by: string;
  created_at: string;
};

export type ItemWithImages = Item & {
  images: ItemImage[];
};

export type ItemListContext = Pick<List, "id" | "name" | "type" | "owner_id">;

export type ItemWithList = Item & {
  lists: ItemListContext;
};
