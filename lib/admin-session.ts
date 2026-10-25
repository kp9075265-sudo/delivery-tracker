import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE = "delivery_admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

function configuredPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD is missing. Set it in .env.local or the Vercel environment settings.");
  }
  if (password.length < 16) {
    throw new Error("ADMIN_PASSWORD must be at least 16 characters long.");
  }
  return password;
}

function signature(value: string, password: string) {
  return createHmac("sha256", password).update(value).digest("hex");
}

export function verifyAdminPassword(candidate: unknown) {
  const password = configuredPassword();
  if (typeof candidate !== "string" || candidate.length > 1024) return false;
  const expected = createHmac("sha256", "admin-password-check").update(password).digest();
  const actual = createHmac("sha256", "admin-password-check").update(candidate).digest();
  return timingSafeEqual(expected, actual);
}

export function createAdminSessionToken() {
  const password = configuredPassword();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const nonce = randomBytes(32).toString("base64url");
  const payload = `${expiresAt}.${nonce}`;
  return `${payload}.${signature(payload, password)}`;
}

export function isValidAdminSessionToken(token: string | undefined) {
  const password = configuredPassword();
  if (!token || token.length > 256) return false;
  const [expiresAtText, nonce, suppliedSignature, ...extra] = token.split(".");
  if (extra.length || !/^\d{10}$/.test(expiresAtText ?? "") ||
    !/^[A-Za-z0-9_-]{40,50}$/.test(nonce ?? "") ||
    !/^[a-f0-9]{64}$/.test(suppliedSignature ?? "")) {
    return false;
  }
  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const payload = `${expiresAtText}.${nonce}`;
  const expectedSignature = signature(payload, password);
  return timingSafeEqual(Buffer.from(suppliedSignature, "hex"), Buffer.from(expectedSignature, "hex"));
}

export async function hasAdminSession() {
  const store = await cookies();
  return isValidAdminSessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);
}

export const adminSessionCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DURATION_SECONDS
};
