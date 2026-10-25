import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionToken,
  verifyAdminPassword
} from "@/lib/admin-session";
import { requireSameOrigin } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!requireSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter the administrator password." }, { status: 400 });
  }

  const password = typeof body === "object" && body !== null && "password" in body
    ? body.password
    : null;

  try {
    if (!verifyAdminPassword(password)) {
      return NextResponse.json({ error: "The administrator password is incorrect." }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(), adminSessionCookieOptions);
    return response;
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Administrator authentication is not configured."
    }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!requireSameOrigin(request)) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", { ...adminSessionCookieOptions, maxAge: 0 });
  return response;
}
