// Must mirror the DB check constraint in supabase/migrations/0024_item_reactions.sql.
export const REACTION_EMOJIS = ["❤️", "👍"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
