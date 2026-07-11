import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

import { getApiTranslator } from "@/lib/api-translator";
import { notifyUsers } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";

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
  const rawEmail = typeof body?.email === "string" ? body.email : null;

  if (!listId || !rawEmail) {
    return NextResponse.json(
      { error: t("api.listIdEmailRequired") },
      { status: 400 },
    );
  }

  const email = rawEmail.trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: t("api.invalidEmail") },
      { status: 400 },
    );
  }

  if (!sessionClaims?.email) {
    return NextResponse.json(
      { error: t("api.missingEmailClaim") },
      { status: 500 },
    );
  }

  if (email === sessionClaims.email.toLowerCase()) {
    return NextResponse.json(
      { error: t("api.cantInviteSelf") },
      { status: 400 },
    );
  }

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
    return NextResponse.json({ status: "already_member" });
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

  const client = await clerkClient();
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
      .select("display_name, email")
      .eq("id", userId)
      .maybeSingle();

    const inviterName =
      inviterProfile?.display_name?.trim() ||
      inviterProfile?.email ||
      sessionClaims.email;

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
            .select("display_name, email")
            .eq("id", userId)
            .maybeSingle();

          const inviterName =
            inviterProfile?.display_name?.trim() ||
            inviterProfile?.email ||
            sessionClaims.email;

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
            });
          }
        }

        return NextResponse.json({
          status: "invited_copy_link",
          invite_id: inviteId,
          inviteUrl,
        });
      }
    }

    return NextResponse.json(
      { invite_id: inviteId, inviteUrl, status: "email_failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    status: "invited_email_sent",
    invite_id: inviteId,
    inviteUrl,
  });
}
