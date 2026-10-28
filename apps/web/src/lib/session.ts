import "server-only";
import { SESSION_COOKIE, type AuthResponse } from "@deskmate/shared/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/**
 * Data Access Layer: the one place Server Components learn who is logged in.
 * The JWT secret lives only in the API, so instead of verifying the cookie here we forward it to
 * GET /api/auth/me and let the API decide. No session or expired session -> /login.
 *
 * Not cached on purpose: after logout the very next render must see "logged out".
 * Callers must sit inside <Suspense>, because reading cookies makes this request-time work.
 */
export async function getCurrentUser(): Promise<AuthResponse> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    cache: "no-store",
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) throw new Error(`Session check failed with status ${res.status}`);
  return res.json();
}
