import { MetricsQuery, type WorkspaceMetrics } from '@deskmate/shared/metrics';
import { Router } from 'express';
import { getWorkspaceMetrics } from '../lib/metrics.js';
import { getWorkspaceId } from '../lib/workspace.js';

/** Dashboard numbers: conversations, handoffs, latency, tokens and estimated cost (logged in). */
export const metricsRouter = Router();

metricsRouter.get('/', async (req, res) => {
  const { days } = MetricsQuery.parse(req.query);
  const body: WorkspaceMetrics = await getWorkspaceMetrics(getWorkspaceId(req), days);
  res.json(body);
});
