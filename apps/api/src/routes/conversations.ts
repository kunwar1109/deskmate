import { SendMessageBody, type ConversationWithMessages } from '@deskmate/shared/chat';
import { pipeUIMessageStreamToResponse } from 'ai';
import { Router } from 'express';
import { createConversation, findConversation, loadMessages, replyToMessage, toConversation } from '../lib/conversations.js';
import { HttpError } from '../lib/errors.js';
import { getWorkspaceId } from '../lib/workspace.js';

/** Dashboard conversations (logged-in owner). The playground uses these; widget chats go through routes/public.ts. */
export const conversationsRouter = Router();

/** Start an empty test conversation. The playground calls this when you send its first message. */
conversationsRouter.post('/', async (req, res) => {
  const conversation = await createConversation(getWorkspaceId(req), 'playground');
  res.status(201).json(toConversation(conversation));
});

conversationsRouter.get('/:id', async (req, res) => {
  const conversation = await findConversation(getWorkspaceId(req), req.params.id);
  const body: ConversationWithMessages = {
    conversation: toConversation(conversation),
    messages: await loadMessages(conversation._id),
  };
  res.json(body);
});

/**
 * Send a test message and stream the agent's reply (AI SDK UI message stream, read by useChat).
 * The full stream, with tool calls and scores, is for the owner; customers get a filtered one.
 */
conversationsRouter.post('/:id/messages', async (req, res) => {
  const { text } = SendMessageBody.parse(req.body);
  const conversation = await findConversation(getWorkspaceId(req), req.params.id);
  // The owner can read customer chats, but not post into them as the bot.
  if (conversation.channel !== 'playground') {
    throw new HttpError(409, "This is a customer's conversation. Test messages only go to playground chats.");
  }
  pipeUIMessageStreamToResponse({ response: res, stream: await replyToMessage(conversation, text) });
});
