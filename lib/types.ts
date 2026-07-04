export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
};

export type List = {
  id: string;
  name: string;
  type: string;
  owner_id: string;
  created_at: string;
  archived_at: string | null;
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

export type Item = {
  id: string;
  list_id: string;
  name: string;
  note: string | null;
  position: number;
  created_by: string;
  created_at: string;
  checked_at: string | null;
  checked_by: string | null;
};
