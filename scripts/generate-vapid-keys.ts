// scripts/generate-vapid-keys.ts
// Usage: pnpm vapid:generate
// Add the output to .env.local and Vercel env vars.

import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("Add these to .env.local and Vercel:\n");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:you@example.com`);
console.log(`SUPABASE_WEBHOOK_SECRET=<generate-a-random-string>`);
