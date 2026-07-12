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
  const listId = typeof body?.listId === "string" ? body.listId : null;
  const rawIdentifier =
    typeof body?.identifier === "string" ? body.identifier : null;

  if (!listId || !rawIdentifier) {
    return NextResponse.json(
      { error: t("api.listIdIdentifierRequired") },
      { status: 400 },
    );
  }

  if (!sessionClaims?.email) {
    return NextResponse.json(
      { error: t("api.missingEmailClaim") },
      { status: 500 },
    );
  }

  // List access must be checked BEFORE resolving the identifier — otherwise
  // an unauthorized caller can use the 404-vs-other response as a
  // username-existence oracle for a list they can't see.
  const { data: list } = await supabase
    .from("lists")
    .select("id, name")
    .eq("id", listId)
    .maybeSingle();

  if (!list) {
    return NextResponse.json(
      { error: t("api.noListAccess") },
      { status: 403 },
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
        console.warn("[invites] getUserList ClerkAPIResponseError code:", err.errors[0]?.code);
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
    return NextResponse.json(
      { error: t("api.cantInviteSelf") },
      { status: 400 },
    );
  }

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  async function grantListMembership({
    listId: grantListId,
    userId: grantUserId,
    inviteId: grantInviteId,
    email: grantEmail,
  }: {
    listId: string;
    userId: string;
    inviteId: string;
    email: string;
  }) {
    const { error: profileError } = await admin
      .from("profiles")
      .upsert({ id: grantUserId, email: grantEmail }, { onConflict: "id" });

    if (profileError) return profileError;

    const { error: memberError } = await admin.from("list_members").upsert(
      { list_id: grantListId, user_id: grantUserId, role: "member" },
      { onConflict: "list_id,user_id", ignoreDuplicates: true },
    );

    if (memberError) return memberError;

    const { error: inviteError } = await admin
      .from("list_invites")
      .update({ status: "accepted" })
      .eq("id", grantInviteId);

    return inviteError;
  }

  const { data: existingMember } = await admin
    .from("list_members")
    .select("user_id, profiles!inner(email)")
    .eq("list_id", listId)
    .eq("profiles.email", email)
    .maybeSingle();

  if (existingMember) {
    return NextResponse.json({ status: "already_member", email });
  }

  let inviteId: string;

  const { data: existingInvite } = await admin
    .from("list_invites")
    .select("id")
    .eq("list_id", listId)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite) {
    inviteId = existingInvite.id;
  } else {
    const { data: newInvite, error: insertError } = await admin
      .from("list_invites")
      .insert({
        list_id: listId,
        email,
        invited_by: userId,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !newInvite) {
      return NextResponse.json(
        { error: t("api.createInviteError") },
        { status: 500 },
      );
    }

    inviteId = newInvite.id;
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const inviteUrl = `${origin}/login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(`/lists/${listId}`)}`;
  const signupRedirectUrl = `${origin}/signup?next=${encodeURIComponent(`/lists/${listId}`)}`;

  const { data: existingUsers } = await client.users.getUserList({
    emailAddress: [email],
  });

  if (existingUsers.length > 0) {
    const inviteeUserId = existingUsers[0].id;

    const grantError = await grantListMembership({
      listId,
      userId: inviteeUserId,
      inviteId,
      email,
    });

    if (grantError) {
      return NextResponse.json(
        { error: t("api.createInviteError") },
        { status: 500 },
      );
    }

    const { data: inviterProfile } = await admin
      .from("profiles")
      .select("username, display_name, email")
      .eq("id", userId)
      .maybeSingle();

    const inviterName = displayNameFor(inviterProfile, sessionClaims.email);

    const { sent } = await notifyUsers({
      userIds: [inviteeUserId],
      type: "list_invite",
      title: "Couples",
      body: `${inviterName} invited you to join ${list.name}`,
      url: `/lists/${listId}`,
    });

    return NextResponse.json({
      status: sent > 0 ? "invited_push_sent" : "invited_copy_link",
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
      publicMetadata: { listId },
    });
  } catch (err) {
    if (isClerkAPIResponseError(err)) {
      const code = err.errors[0]?.code;
      console.warn("[invites] createInvitation ClerkAPIResponseError code:", code);

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
          const grantError = await grantListMembership({
            listId,
            userId: inviteeUserId,
            inviteId,
            email,
          });

          if (grantError) {
            return NextResponse.json(
              { error: t("api.createInviteError") },
              { status: 500 },
            );
          }

          const { data: inviterProfile } = await admin
            .from("profiles")
            .select("username, display_name, email")
            .eq("id", userId)
            .maybeSingle();

          const inviterName = displayNameFor(inviterProfile, sessionClaims.email);

          const { sent } = await notifyUsers({
            userIds: [inviteeUserId],
            type: "list_invite",
            title: "Couples",
            body: `${inviterName} invited you to join ${list.name}`,
            url: `/lists/${listId}`,
          });

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
