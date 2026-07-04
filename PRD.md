# PRD — Couples

_Last updated: 2026-07-04_

## 1. Overview

A private web app for a small circle (starting with a couple) to share lists — primarily a household **shopping list** where both partners add items, check them off as bought, and remove them. Lists come in multiple types with custom names. Updates are **live** for everyone viewing a list.

**Design philosophy: YAGNI-first.** This is a private tool for ~2 people that may grow to a small circle. Build the smallest thing that works well. Only cheap-now/painful-later schema decisions are made ahead of need; everything else waits.

## 2. Goals

- Two+ people share a list and see each other's changes **live** (add / check-off / remove).
- Multiple lists, each with a **custom name** and a **type** (label + icon, e.g. 🛒 shopping, ✓ todo).
- **Invite by email**; invited people join automatically on first sign-in.
- Fast, phone-first item entry and check-off, resilient to poor in-store signal.

## 3. Non-Goals (explicitly NOT in v1)

- Web push / email notifications (in-app live updates + toasts only).
- Categories / aisle taxonomy, tags, or type-specific list behavior.
- Activity feed, comments, per-item history UI.
- Roles beyond owner/member; per-item permissions; a workspace/household layer.
- Full offline-first sync (CRDTs, local DB, conflict resolution).
- Frequent-item suggestions, drag-to-reorder UI, dark mode. (Deferred — most are one column or a few hours whenever missed.)

## 4. Users & Access

- **Owner** — created the list; can rename, archive, and delete it, and manage members.
- **Member** — invited to a list; can add/check/remove items and invite others.
- Access is per-list. A user only ever sees lists they are a member of.

## 5. Tech Stack

- **Frontend/host:** Next.js (App Router) on Vercel.
- **Backend:** Supabase — Postgres, Auth, Realtime.
- **Data access:** Browser talks to Supabase **directly**; **Row-Level Security (RLS)** is the authorization layer (no custom API layer / tRPC).
- **Server code:** exactly one server route — send invite emails via **Resend** (needs a server-side key).
- **Auth:** Supabase **magic-link** (passwordless email) sign-in.
- **Styling:** Tailwind CSS (assumed; confirm at scaffold).
- **PWA:** web app manifest + service worker for home-screen install (v1).

### Why Supabase-direct + RLS
Least code, and authorization lives in the database where it can't be bypassed. Realtime subscriptions give live updates for free. The only thing that must be server-side is the Resend API key, hence the single invite route.

## 6. Data Model

Five tables. Columns marked ⭐ are "cheap now, painful to retrofit" decisions made ahead of UI need.

### `profiles`
One row per user, mirrors `auth.users`.
- `id` (uuid, PK, → auth.users.id)
- `email` (text)
- `display_name` (text, nullable)
- `created_at` (timestamptz, default now())

### `lists`
- `id` (uuid, PK)
- `name` (text) — custom name
- `type` (text) — label/icon key, e.g. `shopping`, `todo` (no behavior attached)
- `owner_id` (uuid → profiles.id)
- `created_at` (timestamptz, default now())
- ⭐ `archived_at` (timestamptz, nullable) — archive instead of hard-delete

### `list_members`
- `list_id` (uuid → lists.id)
- `user_id` (uuid → profiles.id)
- ⭐ `role` (text enum: `owner` | `member`, default `member`)
- `created_at` (timestamptz, default now())
- PK: (`list_id`, `user_id`)

### `list_invites`
Pending email invites.
- `id` (uuid, PK)
- `list_id` (uuid → lists.id)
- `email` (text) — invited address (store lowercased)
- `invited_by` (uuid → profiles.id)
- `status` (text enum: `pending` | `accepted` | `revoked`, default `pending`)
- `created_at` (timestamptz, default now())

### `items`
- `id` (uuid, PK)
- `list_id` (uuid → lists.id)
- `name` (text)
- `note` (text, nullable) — free-text: quantity/brand/specifics ("the lactose-free one, 2x")
- ⭐ `position` (numeric/float) — for future manual reorder; v1 UI sorts by created_at
- ⭐ `created_by` (uuid → profiles.id)
- ⭐ `created_at` (timestamptz, default now())
- ⭐ `checked_at` (timestamptz, nullable) — presence = checked; enables "bought at 6pm" + clear-checked-older-than-X
- ⭐ `checked_by` (uuid → profiles.id, nullable)

> An item is "checked/bought" iff `checked_at IS NOT NULL`. No separate boolean.

### RLS (write against membership from day one)
- **Read** a `lists` / `items` / `list_members` row → user is a member of that `list_id`.
- **Insert/update/delete `items`** → user is a member of that `list_id`.
- **Insert `list_invites`** → user is a member of the `list_id`.
- **Delete / archive / rename `lists`** → user is the `owner`.
- `profiles` → user can read profiles of people sharing a list; can update only their own row.

## 7. Flows

### 7.1 Sign in
Magic link via `supabase.auth.signInWithOtp({ email })` → email link → `/auth/callback` establishes session. On session establish, run **invite reconciliation** (see 7.3).

### 7.2 Create list
Pick a type (icon+label) + enter a custom name → insert `lists` row (owner = current user) + `list_members` row (role `owner`). Redirect to the list.

### 7.3 Invite by email & reconciliation
1. On a list, enter an email → POST to the **invite server route**.
2. Route inserts a `list_invites` row (`status=pending`, email lowercased) and sends a Resend email containing a magic-link sign-in URL for the app.
3. On any sign-in, look up `list_invites` where `email = <user email>` and `status=pending`; for each, create a `list_members` row (role `member`) and mark the invite `accepted`. (Idempotent — safe to run every sign-in.)

### 7.4 Use a list (core loop)
- **List view:** unchecked items on top (sorted by `created_at`), checked items sink to the bottom (dimmed, struck through, not deleted).
- **Add:** autofocused input; **Enter** adds the item and keeps focus for rapid entry. **Optimistic** — appears instantly, reconciles on the Realtime echo.
- **Check off (mark bought):** tap toggles `checked_at`/`checked_by`. Optimistic. Item sinks to bottom.
- **Remove:** delete item. Optimistic, with an **Undo** toast (a few seconds' grace before it's gone for real).
- **Clear checked:** one bulk action removes all checked items on the list.
- **Live:** Realtime subscription on `items` for the current `list_id`; every member viewing sees adds/checks/removes instantly. A **toast** shows when *someone else* adds an item.

### 7.5 Manage list
Owner can rename, **archive** (`archived_at`), and delete a list, and remove members. Archived lists hidden from the default list index (viewable via an "Archived" filter).

## 8. Realtime & Resilience
- Supabase Realtime channel per open list, filtered by `list_id`; RLS applies to the stream.
- **Refetch on window focus / reconnect** — backgrounded phone tabs go stale; on focus or channel reconnect, refetch the list to avoid double-buying.
- Optimistic mutations reconcile against the authoritative Realtime/refetch state (server wins on conflict).

## 9. Error Handling
- **Failed optimistic write** (offline/error) → roll back the optimistic change, show a toast ("Couldn't save — tap to retry").
- **Magic-link expired/invalid** → clear error on the callback page with a "send a new link" action.
- **Invite email send fails** → the `list_invites` row still exists; surface a retry and a copyable manual link so the invite isn't lost.
- **RLS denial** (e.g. link to a list you're not in) → friendly "you don't have access" page, not a raw error.
- **Empty states** — no lists yet, empty list, all-items-checked — each has a clear, inviting prompt.

## 10. Testing
- **RLS policy tests** (highest priority): a non-member cannot read or write another list's rows; a member can; only owner can archive/delete. Test via Supabase with two seeded users.
- **Invite reconciliation:** pending invite → membership on first sign-in; idempotent on repeat sign-in; wrong-email invite does not attach.
- **Core item loop:** add / check / uncheck / remove / clear-checked mutate state and `checked_at`/`checked_by` correctly.
- **Optimistic + rollback:** simulated failed write rolls back and toasts.
- Realtime is validated manually with two browser sessions (automating it is not worth it for v1).

## 11. Milestones (suggested build order)
1. **Schema + RLS** — all five tables, policies, seed two test users. (Foundational; gate on RLS tests.)
2. **Auth** — magic-link sign-in, callback, `profiles` upsert, invite reconciliation.
3. **Lists** — create/list/rename/archive, list index with type icons, membership.
4. **Items core loop** — add/check/remove/clear-checked with optimistic UI + Realtime + toasts.
5. **Invites** — invite server route + Resend email + pending-invite UI.
6. **PWA + polish** — manifest, service worker, empty states, focus-refetch, error toasts.
7. **Deploy** — Vercel + Supabase project wiring, env/secrets.

## 12. Open Questions / Confirm at Scaffold
- App/folder name: **`couples`** (decided).
- Tailwind + component approach (plain Tailwind vs shadcn/ui).
- Supabase project: new dedicated project (recommended) vs shared.
- Resend domain/sender for invite emails.
