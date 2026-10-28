import type { RealtimeTicket } from '@deskmate/shared/realtime';
import { Router } from 'express';
import { env } from '../config.js';
import { createRealtimeTicket, getAuth } from '../lib/auth.js';

export const realtimeRouter = Router();

/** A 60-second ticket for the dashboard's socket, fetched with the session cookie (see createRealtimeTicket). */
realtimeRouter.get('/ticket', async (req, res) => {
  const body: RealtimeTicket = { token: await createRealtimeTicket(getAuth(req)), url: env.PUBLIC_URL };
  res.json(body);
});
