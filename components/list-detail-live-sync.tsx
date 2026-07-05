"use client";

import { useRealtimeListMembers } from "@/lib/use-realtime-lists";

export function ListDetailLiveSync({ listId }: { listId: string }) {
  useRealtimeListMembers(listId);
  return null;
}
