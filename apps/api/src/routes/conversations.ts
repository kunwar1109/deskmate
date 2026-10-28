import {
  ConversationListQuery,
  ConversationStatusBody,
  HumanReplyBody,
  SendMessageBody,
  type ConversationWithMessages,
} from '@deskmate/shared/chat';
import { pipeUIMessageStreamToResponse } from 'ai';
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { users } from '../db.js';
import { getAuth } from '../lib/auth.js';
import {
  addHumanReply,
  createConversation,
  findConversation,
  listConversations,
  loadMessages,
  replyToMessage,
  setConversationStatus,
  toConversation,
} from '../lib/conversations.js';
import { HttpError } from '../lib/errors.js';
import { getWorkspaceId } from '../lib/workspace.js';

/**
 * Dashboard conversations (logged in): the playground's test chats, and the inbox where the team reads and
 * answers customer chats. Customers' own requests go through routes/public.ts.
 */
export const conversationsRouter = Router();

/** The inbox list: widget chats, optionally only one status (e.g. ?status=handed_off for "needs a human"). */
conversationsRouter.get('/', async (req, res) => {
  const { status } = ConversationListQuery.parse(req.query);
  res.json(await listConversations(getWorkspaceId(req), status));
});

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

/** A team member's reply to a customer. Takes the chat over from the bot, and reaches the widget live. */
conversationsRouter.post('/:id/replies', async (req, res) => {
  const { text } = HumanReplyBody.parse(req.body);
  const { userId, workspaceId } = getAuth(req);
  const conversation = await findConversation(workspaceId, req.params.id);
  const user = await users.findOne({ _id: new ObjectId(userId) }, { projection: { name: 1 } });
  const message = await addHumanReply(conversation, text, { kind: 'human', name: user?.name ?? 'Support team' });
  res.status(201).json(message);
});

conversationsRouter.post('/:id/status', async (req, res) => {
  const { status } = ConversationStatusBody.parse(req.body);
  const conversation = await findConversation(getWorkspaceId(req), req.params.id);
  res.json(await setConversationStatus(conversation, status));
});
