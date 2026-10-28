import { Router } from 'express';
import { MongoServerError, ObjectId } from 'mongodb';
import { z } from 'zod';
import { client, memberships, users, workspaces } from '../db.js';
import {
  clearSessionCookie,
  createSessionToken,
  getAuth,
  hashPassword,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../lib/auth.js';
import { ConflictError, UnauthorizedError } from '../lib/errors.js';

// Normalize before validating, so " Ana@Mail.com " and "ana@mail.com" are the same account.
const Email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));
// The max length stops someone making the server hash a 10 MB "password".
const Password = z.string().min(8, 'Password must be at least 8 characters').max(200, 'Password is too long');

const SignupBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: Email,
  password: Password,
  workspaceName: z.string().trim().min(1, 'Workspace name is required').max(100),
});

const LoginBody = z.object({
  email: Email,
  password: z.string().min(1, 'Password is required').max(200),
});

// Hashed once at startup. Login checks against it when the email doesn't exist, so "unknown email"
// takes as long as "wrong password" and response time can't reveal who has an account.
const DUMMY_HASH = await hashPassword('not-a-real-password-only-for-timing');

export const authRouter = Router();

authRouter.post('/signup', async (req, res) => {
  const body = SignupBody.parse(req.body);
  const passwordHash = await hashPassword(body.password);
  const now = new Date();
  const userId = new ObjectId();
  const workspaceId = new ObjectId();

  // User, workspace and owner membership are created together or not at all,
  // so a failure halfway can't leave a user with no workspace.
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await users.insertOne({ _id: userId, email: body.email, name: body.name, passwordHash, createdAt: now }, { session });
      await workspaces.insertOne({ _id: workspaceId, name: body.workspaceName, createdAt: now }, { session });
      await memberships.insertOne({ userId, workspaceId, role: 'owner', createdAt: now }, { session });
    });
  } catch (err) {
    // 11000 = duplicate key: the unique index on users.email caught an existing account.
    if (err instanceof MongoServerError && err.code === 11000) {
      throw new ConflictError('An account with this email already exists');
    }
    throw err;
  } finally {
    await session.endSession();
  }

  setSessionCookie(res, await createSessionToken({ userId: userId.toString(), workspaceId: workspaceId.toString() }));
  res.status(201).json({
    user: { id: userId, name: body.name, email: body.email },
    workspace: { id: workspaceId, name: body.workspaceName },
  });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = LoginBody.parse(req.body);
  const user = await users.findOne({ email });
  const valid = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);
  // Same message for both cases, so the API doesn't confirm which emails are registered.
  if (!user || !valid) throw new UnauthorizedError('Invalid email or password');

  // Phase 2: each user has the one workspace created at signup.
  const membership = await memberships.findOne({ userId: user._id }, { sort: { createdAt: 1 } });
  const workspace = membership && (await workspaces.findOne({ _id: membership.workspaceId }));
  if (!workspace) throw new Error(`User ${user._id.toString()} has no workspace`);

  setSessionCookie(res, await createSessionToken({ userId: user._id.toString(), workspaceId: workspace._id.toString() }));
  res.json({
    user: { id: user._id, name: user.name, email: user.email },
    workspace: { id: workspace._id, name: workspace.name },
  });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

// The dashboard calls this on load to find out who is logged in.
authRouter.get('/me', requireAuth, async (req, res) => {
  const { userId, workspaceId } = getAuth(req);
  const [user, workspace] = await Promise.all([
    users.findOne({ _id: new ObjectId(userId) }, { projection: { passwordHash: 0 } }),
    workspaces.findOne({ _id: new ObjectId(workspaceId) }),
  ]);
  if (!user || !workspace) {
    // Valid token, but the account is gone. Drop the stale cookie.
    clearSessionCookie(res);
    throw new UnauthorizedError();
  }
  res.json({
    user: { id: user._id, name: user.name, email: user.email },
    workspace: { id: workspace._id, name: workspace.name },
  });
});
