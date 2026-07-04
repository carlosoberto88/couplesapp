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

## Deploy on Vercel

The easiest way to deploy this Next.js app is the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme). Database migrations run against Supabase directly (`pnpm db:push`), not during the Vercel build.
