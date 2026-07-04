import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { auth } from "@clerk/nextjs/server";

import { createClient } from "@/lib/supabase/server";
import { aiModel } from "@/lib/ai/model";
import { parseResultSchema } from "@/lib/ai/schemas";

const MAX_TEXT_LENGTH = 4000;

export async function POST(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = await createClient();

  const body = await request.json().catch(() => null);
  const listId = typeof body?.listId === "string" ? body.listId : null;
  const text = typeof body?.text === "string" ? body.text : null;

  if (!listId || !text) {
    return NextResponse.json(
      { error: "listId and text are required" },
      { status: 400 },
    );
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: "That's a lot of text — try a smaller chunk" },
      { status: 400 },
    );
  }

  // RLS ensures this only returns a row if the caller is a member of the list.
  const { data: list } = await supabase
    .from("lists")
    .select("id")
    .eq("id", listId)
    .maybeSingle();

  if (!list) {
    return NextResponse.json(
      { error: "You don't have access to this list" },
      { status: 403 },
    );
  }

  // User-scoped, RLS-protected — only names on this list, for dedupe context.
  const { data: existingItems } = await supabase
    .from("items")
    .select("name")
    .eq("list_id", listId);

  const existingNames = (existingItems ?? []).map((item) => item.name);

  try {
    const { object } = await generateObject({
      model: aiModel,
      schema: parseResultSchema,
      maxOutputTokens: 2048,
      prompt: [
        "Extract a shopping/todo list's worth of discrete items from the text below.",
        "Each item needs a short `name` and an optional `note` for quantity, brand, or prep details (e.g. name: \"onions\", note: \"2, diced\").",
        "Skip anything that's already on the list — do not repeat these existing item names:",
        existingNames.length > 0 ? existingNames.join(", ") : "(none yet)",
        "",
        "Text to extract from:",
        text,
      ].join("\n"),
    });

    return NextResponse.json({ items: object.items });
  } catch {
    return NextResponse.json(
      { error: "Couldn't make sense of that text — try rephrasing or pasting less at once" },
      { status: 502 },
    );
  }
}
