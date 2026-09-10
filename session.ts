import { createClient } from "@/lib/supabase/server";
import { unauthorized, forbidden } from "@/lib/errors";
import type { MembershipRole, Profile } from "@/types";

export interface AuthContext {
  userId: string;
  email: string | null;
  profile: Profile | null;
  organizationId: string;
  role: MembershipRole;
}

/**
 * Resolve authenticated user + primary organization from the session.
 * Never trust client-supplied organization_id or user_id.
 */
export async function requireAuth(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw unauthorized();
  }

  // Profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // Primary membership (owner first, then any)
  const { data: memberships, error: memErr } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (memErr || !memberships || memberships.length === 0) {
    // Attempt to ensure org exists (idempotent bootstrap for new users)
    const ensured = await ensureUserOrganization(user.id, user.email);
    if (!ensured) {
      throw forbidden("No organization membership found. Please contact support.");
    }
    return {
      userId: user.id,
      email: user.email ?? null,
      profile: profile as Profile | null,
      organizationId: ensured.organizationId,
      role: ensured.role,
    };
  }

  const primary =
    memberships.find((m) => m.role === "owner") ?? memberships[0];

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: profile as Profile | null,
    organizationId: primary.organization_id,
    role: primary.role as MembershipRole,
  };
}

/**
 * Idempotent: create profile + personal org + membership if missing.
 * Safe to call multiple times.
 */
export async function ensureUserOrganization(
  userId: string,
  email: string | null | undefined
): Promise<{ organizationId: string; role: MembershipRole } | null> {
  const supabase = await createClient();

  // Profile (upsert)
  await supabase.from("profiles").upsert(
    {
      id: userId,
      email: email ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  // Existing membership?
  const { data: existing } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      organizationId: existing.organization_id,
      role: existing.role as MembershipRole,
    };
  }

  // Create personal organization
  const slugBase =
    (email?.split("@")[0] ?? "org")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "org";
  const slug = `${slugBase}-${userId.slice(0, 8)}`;

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({
      name: email ? `${email.split("@")[0]}'s Workspace` : "My Workspace",
      slug,
    })
    .select("id")
    .single();

  if (orgErr || !org) {
    // Race: another request may have created it
    const { data: retry } = await supabase
      .from("memberships")
      .select("organization_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (retry) {
      return {
        organizationId: retry.organization_id,
        role: retry.role as MembershipRole,
      };
    }
    console.error("Failed to create organization", orgErr);
    return null;
  }

  const { error: memErr } = await supabase.from("memberships").insert({
    organization_id: org.id,
    user_id: userId,
    role: "owner",
  });

  if (memErr) {
    console.error("Failed to create membership", memErr);
    return null;
  }

  // Free plan subscription
  await supabase.from("subscriptions").upsert(
    {
      organization_id: org.id,
      plan_id: "free",
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000
      ).toISOString(),
    },
    { onConflict: "organization_id" }
  );

  return { organizationId: org.id, role: "owner" };
}

export async function getOptionalAuth(): Promise<AuthContext | null> {
  try {
    return await requireAuth();
  } catch {
    return null;
  }
}
