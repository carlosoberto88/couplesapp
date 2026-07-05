This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database migrations

Schema changes live in [`supabase/migrations/`](supabase/migrations/) and are applied to the hosted Supabase project via the CLI.

### One-time setup

1. Install the CLI: `brew install supabase/tap/supabase`
2. Log in: `supabase login`
3. Link this repo to your project (ref is in your Supabase dashboard URL):

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

If the remote database already has schema from manual SQL runs, baseline the history before pushing:

```bash
supabase migration repair --status applied 0001
supabase migration repair --status applied 0002
supabase migration repair --status applied 0003
```

### Day-to-day workflow

| Task | Command |
|------|---------|
| Apply pending migrations to remote | `pnpm db:push` |
| See local vs remote migration status | `pnpm db:status` |
| Create a new migration | `supabase migration new my_change_name` |
| Mark a migration applied without running SQL | `pnpm db:repair -- --status applied VERSION` |

After creating a migration file, edit the SQL, run `pnpm db:push`, and commit the new file.

**Rule:** make all schema changes through migration files, not the Supabase Dashboard SQL editor — that keeps local git history and remote migration history in sync.

### Verify RLS

```bash
pnpm test:rls
```

## Web push notifications (optional)

Background notifications when a partner adds an item require VAPID keys and a Supabase Database Webhook.

### 1. Generate keys

```bash
pnpm vapid:generate
```

Add the output to `.env.local` and Vercel environment variables:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (e.g. `mailto:you@example.com`)
- `SUPABASE_WEBHOOK_SECRET` (random string you choose)

### 2. Apply migration

```bash
pnpm db:push
```

This creates the `push_subscriptions` table (migration `0006`).

### 3. Configure Supabase webhook

In **Supabase Dashboard → Database → Webhooks → Create**:

- **Table:** `items`
- **Events:** Insert
- **URL:** `https://YOUR_VERCEL_DOMAIN/api/push/send`
- **HTTP Headers:** `Authorization: Bearer YOUR_SUPABASE_WEBHOOK_SECRET`

### 4. Enable on device

In production, the app prompts to enable notifications after install. iOS requires **Add to Home Screen** for web push.

## Deploy on Vercel

The easiest way to deploy this Next.js app is the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme). Database migrations run against Supabase directly (`pnpm db:push`), not during the Vercel build.
