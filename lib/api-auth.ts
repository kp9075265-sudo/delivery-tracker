import { NextResponse } from "next/server";
import { getCurrentAppUser, type AppUser } from "@/lib/current-user";
import { hasAdminSession } from "@/lib/admin-session";

export async function requireApiUser() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }
  return user;
}

export async function requireApiAdmin() {
  try {
    if (await hasAdminSession()) return { role: "admin" as const };
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Administrator authentication is not configured."
    }, { status: 503 });
  }
  return NextResponse.json({ error: "Administrator sign-in is required." }, { status: 401 });
}

export function isAppUser(value: AppUser | NextResponse): value is AppUser {
  return !(value instanceof NextResponse);
}

export function isApiError(value: { role: "admin" } | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
