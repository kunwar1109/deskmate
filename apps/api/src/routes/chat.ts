import { Router } from 'express';
import { z } from 'zod';
import { answerQuestion } from '../lib/answer.js';
import { getWorkspaceId } from '../lib/workspace.js';

const ChatBody = z.object({
  question: z.string().trim().min(1, 'Ask a question').max(2000, 'Question is too long'),
});

export const chatRouter = Router();

chatRouter.post('/', async (req, res) => {
  const { question } = ChatBody.parse(req.body);
  const result = await answerQuestion(getWorkspaceId(req), question);

  console.log(
    JSON.stringify({
      event: 'chat',
      handoff: result.handoff,
      handoffReason: result.handoffReason,
      topScore: result.topScore,
      latencyMs: result.latencyMs,
      usage: result.usage,
    }),
  );

  res.json(result);
});
