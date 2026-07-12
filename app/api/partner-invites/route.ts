import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

import { getApiTranslator } from "@/lib/api-translator";
import { notifyUsers } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { displayNameFor } from "@/lib/display-name";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const t = await getApiTranslator(request);
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });
  }

  const supabase = await createClient();

  const body = await request.json().catch(() => null);
  const rawIdentifier =
    typeof body?.identifier === "string" ? body.identifier : null;

  if (!rawIdentifier) {
    return NextResponse.json(
      { error: t("api.identifierRequired") },
      { status: 400 },
    );
  }

  if (!sessionClaims?.email) {
    return NextResponse.json(
      { error: t("api.missingEmailClaim") },
      { status: 500 },
    );
  }

  const inviterEmailClaim = sessionClaims.email;

  // Already-paired guard runs before identifier resolution so a doomed
  // request short-circuits without a Clerk round-trip.
  const { data: activePartnershipId } = await supabase.rpc("active_partnership_id");

  if (activePartnershipId) {
    return NextResponse.json(
      { error: t("api.alreadyPartnered") },
      { status: 409 },
    );
  }

  const trimmedIdentifier = rawIdentifier.trim();
  const client = await clerkClient();

  // The identifier is either a real email (existing flow, unchanged) or a
  // username that must resolve, server-side, to that Clerk user's OWN
  // primary email — never trust a client-supplied email for a username.
  let email: string;

  if (EMAIL_RE.test(trimmedIdentifier)) {
    email = trimmedIdentifier.toLowerCase();
  } else {
    // Clerk usernames can't exceed this length; reject before the API call.
    if (trimmedIdentifier.length > 64) {
      return NextResponse.json(
        { error: t("api.userNotFound") },
        { status: 404 },
      );
    }

    let usernameMatches;
    try {
      ({ data: usernameMatches } = await client.users.getUserList({
        username: [trimmedIdentifier],
      }));
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        console.warn("[partner-invites] getUserList ClerkAPIResponseError code:", err.errors[0]?.code);
      }
      return NextResponse.json(
        { error: t("api.inviteLookupFailed") },
        { status: 502 },
      );
    }

    // Clerk's username filter is a case-insensitive PARTIAL match — require
    // an exact match so we never resolve to the wrong person.
    const match = usernameMatches[0];
    const resolvedEmail =
      match?.username?.toLowerCase() === trimmedIdentifier.toLowerCase()
        ? match.primaryEmailAddress?.emailAddress
        : undefined;

    if (!resolvedEmail) {
      return NextResponse.json(
        { error: t("api.userNotFound") },
        { status: 404 },
      );
    }

    email = resolvedEmail.toLowerCase();
  }

  if (email === sessionClaims.email.toLowerCase()) {
    return NextResponse.json({ error: t("api.cantInviteSelf") }, { status: 400 });
  }

  let inviteId: string;

  const { data: existingInvite } = await supabase
    .from("partner_invites")
    .select("id")
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite) {
    inviteId = existingInvite.id;
  } else {
    const { data: newInvite, error: insertError } = await supabase
      .from("partner_invites")
      .insert({ inviter_id: userId, email })
      .select("id")
      .single();

    if (insertError?.code === "23505") {
      // Lost the race to a concurrent insert of the same pending invite — idempotent, not an error.
      const { data: raceInvite } = await supabase
        .from("partner_invites")
        .select("id")
        .eq("email", email)
        .eq("status", "pending")
        .maybeSingle();

      if (!raceInvite) {
        return NextResponse.json(
          { error: t("api.createInviteError") },
          { status: 500 },
        );
      }

      inviteId = raceInvite.id;
    } else if (insertError || !newInvite) {
      return NextResponse.json(
        { error: t("api.createInviteError") },
        { status: 500 },
      );
    } else {
      inviteId = newInvite.id;
    }
  }

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const inviteUrl = `${origin}/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent("/dates")}`;
  const signupRedirectUrl = `${origin}/signup?next=${encodeURIComponent("/dates")}`;

  async function notifyExistingUser(inviteeUserId: string) {
    const { data: inviterProfile } = await admin
      .from("profiles")
      .select("username, display_name, email")
      .eq("id", userId)
      .maybeSingle();

    const inviterName = displayNameFor(inviterProfile, inviterEmailClaim);

    return notifyUsers({
      userIds: [inviteeUserId],
      type: "partner_invite",
      title: "Couples",
      body: `${inviterName} invited you to pair up`,
      url: "/dates",
    });
  }

  const { data: existingUsers } = await client.users.getUserList({
    emailAddress: [email],
  });

  if (existingUsers.length > 0) {
    const { sent } = await notifyExistingUser(existingUsers[0].id);

    if (sent > 0) {
      return NextResponse.json({
        status: "invited_push_sent",
        invite_id: inviteId,
        inviteUrl,
        email,
      });
    }

    return NextResponse.json({
      status: "invited_copy_link",
      invite_id: inviteId,
      inviteUrl,
      email,
    });
  }

  try {
    await client.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: signupRedirectUrl,
      notify: true,
    });
  } catch (err) {
    if (isClerkAPIResponseError(err)) {
      const code = err.errors[0]?.code;
      console.warn("[partner-invites] createInvitation ClerkAPIResponseError code:", code);

      if (code === "duplicate_record") {
        return NextResponse.json({
          status: "invited_email_sent",
          invite_id: inviteId,
          inviteUrl,
          email,
        });
      }

      if (code === "form_identifier_exists") {
        const { data: raceUsers } = await client.users.getUserList({
          emailAddress: [email],
        });
        const inviteeUserId = raceUsers[0]?.id;

        if (inviteeUserId) {
          const { sent } = await notifyExistingUser(inviteeUserId);

          if (sent > 0) {
            return NextResponse.json({
              status: "invited_push_sent",
              invite_id: inviteId,
              inviteUrl,
              email,
            });
          }
        }

        return NextResponse.json({
          status: "invited_copy_link",
          invite_id: inviteId,
          inviteUrl,
          email,
        });
      }
    }

    return NextResponse.json(
      { invite_id: inviteId, inviteUrl, status: "email_failed", email },
      { status: 502 },
    );
  }

  return NextResponse.json({
    status: "invited_email_sent",
    invite_id: inviteId,
    inviteUrl,
    email,
  });
}
