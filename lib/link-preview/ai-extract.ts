import { generateObject } from "ai";
import { z } from "zod";

import { aiModel } from "@/lib/ai/model";

const aiLinkPreviewSchema = z.object({
  title: z.string().max(200),
  imageUrl: z.string().url().nullable(),
  price: z.number().nonnegative().nullable(),
  currency: z.string().max(10).nullable(),
});

export async function extractPreviewWithAi(htmlSnippet: string, pageUrl: string) {
  const { object } = await generateObject({
    model: aiModel,
    schema: aiLinkPreviewSchema,
    maxOutputTokens: 512,
    prompt: [
      "Extract product metadata from this HTML snippet.",
      "Return a concise product title (not the site name), an absolute image URL if present, and price/currency if visible.",
      "If no image URL is found, return null for imageUrl.",
      `Page URL: ${pageUrl}`,
      "",
      htmlSnippet,
    ].join("\n"),
  });

  return {
    title: object.title.trim().slice(0, 200),
    imageUrl: object.imageUrl,
    price: object.price,
    currency: object.currency?.trim().toUpperCase().slice(0, 10) ?? null,
  };
}
