"use client";

import { useEffect, useMemo, useState } from "react";

import { useSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const MAX_CHIPS = 8;

type UsualItemsProps = {
  listId: string;
  currentItemNames: string[];
  onAdd: (name: string) => void;
};

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export function UsualItems({ listId, currentItemNames, onAdd }: UsualItemsProps) {
  const supabase = useSupabaseClient();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase.rpc("suggest_usual_items", { p_list_id: listId });

      if (!cancelled && !error && data) {
        const names = (data as { name: string; times: number }[]).map((row) => row.name);
        setSuggestions(names);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listId, supabase]);

  const onListNames = useMemo(() => new Set(currentItemNames.map(normalize)), [currentItemNames]);

  const visibleChips = useMemo(
    () =>
      suggestions
        .filter((name) => !dismissed.has(normalize(name)))
        .filter((name) => !onListNames.has(normalize(name)))
        .slice(0, MAX_CHIPS),
    [suggestions, dismissed, onListNames],
  );

  if (visibleChips.length === 0) return null;

  function handleTap(name: string) {
    setDismissed((prev) => new Set(prev).add(normalize(name)));
    onAdd(name);
  }

  return (
    <div className="flex flex-wrap gap-2 px-1">
      {visibleChips.map((name) => (
        <Button
          key={name}
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => handleTap(name)}
          className="rounded-full bg-duo-teal-tint text-foreground hover:bg-duo-teal-tint/70"
        >
          {name}
        </Button>
      ))}
    </div>
  );
}
