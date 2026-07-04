import { z } from "zod";

// Output shape for POST /api/ai/parse — candidate items extracted from
// free text. Nothing is inserted server-side; this is reviewed by the
// user before any DB write.
export const parseResultSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().max(200),
        note: z.string().max(500).optional(),
      }),
    )
    .max(30),
});

export type ParseResult = z.infer<typeof parseResultSchema>;
