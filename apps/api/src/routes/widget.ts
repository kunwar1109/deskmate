import { AllowedOriginsBody, type WidgetSettings } from '@deskmate/shared/widget';
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { workspaces } from '../db.js';
import { ensureWidget, generateWidgetKey } from '../lib/widget.js';
import { getWorkspaceId } from '../lib/workspace.js';

/** The owner's widget settings (logged in). The dashboard page that uses these arrives with the widget itself. */
export const widgetRouter = Router();

widgetRouter.get('/', async (req, res) => {
  const body: WidgetSettings = await ensureWidget(getWorkspaceId(req));
  res.json(body);
});

widgetRouter.put('/allowed-origins', async (req, res) => {
  const { allowedOrigins } = AllowedOriginsBody.parse(req.body);
  const workspaceId = getWorkspaceId(req);
  await ensureWidget(workspaceId);
  await workspaces.updateOne(
    { _id: new ObjectId(workspaceId) },
    { $set: { 'widget.allowedOrigins': [...new Set(allowedOrigins)] } },
  );
  res.json(await ensureWidget(workspaceId));
});

/**
 * New key, effective immediately: the old one stops working at once (for example after someone copied
 * the widget onto a site you don't control). The owner then updates the snippet on their site.
 */
widgetRouter.post('/rotate-key', async (req, res) => {
  const workspaceId = getWorkspaceId(req);
  await ensureWidget(workspaceId);
  await workspaces.updateOne({ _id: new ObjectId(workspaceId) }, { $set: { 'widget.key': generateWidgetKey() } });
  res.json(await ensureWidget(workspaceId));
});
