import { google } from "@ai-sdk/google";

// Single source of truth for the model used by every AI route. Reads
// GOOGLE_GENERATIVE_AI_API_KEY from the environment automatically
// (server-only — never exposed to the client).
//
// If parse/categorize quality is thin, bump to "gemini-2.5-flash" — that's
// a one-string change here, nowhere else.
export const aiModel = google("gemini-2.5-flash-lite");
