import crypto from "node:crypto";

import type { PreviewTokenPayload } from "@/lib/link-preview/types";

const PREVIEW_TTL_MS = 15 * 60 * 1000;

function getSecret(): string {
  const secret =
    process.env.LINK_PREVIEW_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
  if (!secret) {
    throw new Error("missing_preview_secret");
  }
  return secret;
}

export function createPreviewToken(
  payload: Omit<PreviewTokenPayload, "exp">,
): string {
  const fullPayload: PreviewTokenPayload = {
    ...payload,
    exp: Date.now() + PREVIEW_TTL_MS,
  };
  const data = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function verifyPreviewToken(token: string): PreviewTokenPayload | null {
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8"),
    ) as PreviewTokenPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (!payload.normalizedUrl || !payload.name) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashNormalizedUrl(normalizedUrl: string): string {
  return crypto.createHash("sha256").update(normalizedUrl).digest("hex");
}
