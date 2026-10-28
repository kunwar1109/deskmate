import { z } from 'zod';

// The httpOnly session cookie the API sets. The dashboard only checks whether it exists; the API verifies it.
export const SESSION_COOKIE = 'deskmate_session';

// Normalize before validating, so " Ana@Mail.com " and "ana@mail.com" are the same account.
export const Email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));

// The max length stops someone making the server hash a 10 MB "password".
export const Password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password is too long');

export const SignupBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: Email,
  password: Password,
  workspaceName: z.string().trim().min(1, 'Workspace name is required').max(100),
});
export type SignupInput = z.input<typeof SignupBody>;

export const LoginBody = z.object({
  email: Email,
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.input<typeof LoginBody>;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export interface PublicWorkspace {
  id: string;
  name: string;
}

/** Returned by signup, login and GET /api/auth/me. Never includes the password hash. */
export interface AuthResponse {
  user: PublicUser;
  workspace: PublicWorkspace;
}
