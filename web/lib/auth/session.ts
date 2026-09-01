import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export const LOGIN_USERNAME = process.env.LOGIN_USERNAME ?? "askprofnui";
// The course password is kept as a scrypt hash so the public repo does not
// reveal it. Setting LOGIN_PASSWORD replaces it.
const PASSWORD_SALT = "nui-2.0-login";
const PASSWORD_HASH = "b45a447a63ecf2b46db5b791f3c42df45ad39187568b7e6f3ac8fce102f9859c";

export const SESSION_COOKIE = "askprofnui_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function secret(): string {
  return process.env.SESSION_SECRET ?? process.env.GROQ_API_KEY ?? "askprofnui-demo-session";
}

function token(): string {
  return createHmac("sha256", secret()).update("logged-in").digest("hex");
}

function same(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function passwordMatches(password: string): boolean {
  if (process.env.LOGIN_PASSWORD) return same(password, process.env.LOGIN_PASSWORD);
  return same(scryptSync(password, PASSWORD_SALT, 32).toString("hex"), PASSWORD_HASH);
}

export function credentialsMatch(username: string, password: string): boolean {
  return (
    same(username.trim().toLowerCase(), LOGIN_USERNAME.toLowerCase()) &&
    passwordMatches(password)
  );
}

export function isValidSession(value: string | undefined): boolean {
  return Boolean(value) && same(value as string, token());
}

export function sessionCookieValue(): string {
  const parts = [
    `${SESSION_COOKIE}=${token()}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
