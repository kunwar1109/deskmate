import { ChatBody } from '@deskmate/shared/chat';
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { workspaces } from '../db.js';
import { runSupportAgent } from '../lib/agent.js';
import { getWorkspaceId } from '../lib/workspace.js';

export const chatRouter = Router();

chatRouter.post('/', async (req, res) => {
  const { question } = ChatBody.parse(req.body);
  const workspaceId = getWorkspaceId(req);
  // The name goes into the agent's instructions ("You are the support assistant for BrewBox").
  const workspace = await workspaces.findOne({ _id: new ObjectId(workspaceId) }, { projection: { name: 1 } });

  const result = await runSupportAgent({ workspaceId, workspaceName: workspace?.name ?? 'this company', question });

  console.log(
    JSON.stringify({
      event: 'chat',
      handoff: result.handoff,
      handoffReason: result.handoffReason,
      topScore: result.topScore,
      tools: result.toolCalls.map((c) => c.tool),
      latencyMs: result.latencyMs,
      usage: result.usage,
    }),
  );

  res.json(result);
});
