import type { Conversation, ConversationStatus, DeskmateUIMessage, HumanSender } from '@deskmate/shared/chat';
import { createUIMessageStream, generateId, type InferUIMessageChunk } from 'ai';
import { ObjectId, type WithId } from 'mongodb';
import { conversations, messages, workspaces, type ConversationRecord, type MessageRecord } from '../db.js';
import { publishConversation, publishMessage, publishStatus } from '../realtime.js';
import { streamSupportAgent, type AgentReply } from './agent.js';
import { HttpError } from './errors.js';

/**
 * Conversation logic shared by the dashboard (routes/conversations.ts) and the public widget API
 * (routes/public.ts). The routes only differ in who may call them and what they send back.
 *
 * Who answers a widget chat depends on its status:
 * - open: the bot
 * - handed_off: a person; the bot stays quiet, so it never talks over the team
 * - closed: a new customer message reopens it, and the bot answers again
 * Playground chats always get the bot: they're a test bench, not a real customer.
 */

type ReplyStream = ReadableStream<InferUIMessageChunk<DeskmateUIMessage>>;

const TITLE_LENGTH = 80;
const INBOX_PAGE_SIZE = 50;

export function toConversation(doc: WithId<ConversationRecord>): Conversation {
  return {
    id: doc._id.toString(),
    channel: doc.channel,
    status: doc.status,
    title: doc.title,
    ...(doc.handoffReason ? { handoffReason: doc.handoffReason } : {}),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toUIMessage(doc: WithId<MessageRecord>): DeskmateUIMessage {
  return {
    // Replies saved before ids were generated have messageId "": fall back to the database id, which is unique.
    id: doc.messageId || doc._id.toString(),
    role: doc.role,
    parts: doc.parts,
    ...(doc.metadata ? { metadata: doc.metadata } : {}),
  };
}

export async function createConversation(
  workspaceId: string,
  channel: ConversationRecord['channel'],
  extra: Pick<ConversationRecord, 'visitorTokenHash'> = {},
): Promise<WithId<ConversationRecord>> {
  const now = new Date();
  const record: ConversationRecord = {
    workspaceId,
    channel,
    status: 'open',
    title: 'New conversation',
    ...extra,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await conversations.insertOne(record);
  return { ...record, _id: insertedId };
}

// Filters by _id AND workspaceId: another workspace's conversation id gets the same 404 as a made-up one.
export async function findConversation(workspaceId: string, id: string): Promise<WithId<ConversationRecord>> {
  const conversation = ObjectId.isValid(id)
    ? await conversations.findOne({ _id: new ObjectId(id), workspaceId })
    : null;
  if (!conversation) throw new HttpError(404, 'Conversation not found');
  return conversation;
}

/** The inbox: widget chats, most recently active first. */
export async function listConversations(workspaceId: string, status?: ConversationStatus): Promise<Conversation[]> {
  const docs = await conversations
    .find({ workspaceId, channel: 'widget', ...(status ? { status } : {}) })
    .sort({ updatedAt: -1 })
    .limit(INBOX_PAGE_SIZE)
    .toArray();
  return docs.map(toConversation);
}

export async function loadMessages(conversationId: ObjectId): Promise<DeskmateUIMessage[]> {
  const docs = await messages.find({ conversationId }).sort({ createdAt: 1, _id: 1 }).toArray();
  return docs.map(toUIMessage);
}

async function saveMessage(conversation: WithId<ConversationRecord>, message: DeskmateUIMessage) {
  await messages.insertOne({
    workspaceId: conversation.workspaceId,
    conversationId: conversation._id,
    messageId: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    parts: message.parts,
    metadata: message.metadata,
    createdAt: new Date(),
  });
}

/** Updates a conversation and, for widget chats, refreshes it in every agent's inbox. */
async function updateConversation(
  conversation: WithId<ConversationRecord>,
  set: Partial<ConversationRecord>,
): Promise<WithId<ConversationRecord>> {
  const updated = await conversations.findOneAndUpdate(
    { _id: conversation._id, workspaceId: conversation.workspaceId },
    { $set: { ...set, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new HttpError(404, 'Conversation not found');
  if (updated.channel === 'widget') publishConversation(updated.workspaceId, toConversation(updated));
  return updated;
}

/** A reply stream with no content, for when a person (not the bot) will answer. The widget shows nothing new. */
function emptyReply(): ReplyStream {
  return createUIMessageStream<DeskmateUIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: 'start', messageId: generateId() });
      writer.write({ type: 'finish' });
    },
  });
}

/**
 * Saves the customer's message and returns the bot's reply as a UI message stream (or an empty one while a
 * person handles the chat). The bot's reply is saved when it finishes, even if the client has disconnected.
 */
export async function replyToMessage(conversation: WithId<ConversationRecord>, text: string): Promise<ReplyStream> {
  const { workspaceId } = conversation;
  const isWidget = conversation.channel === 'widget';
  const [workspace, history] = await Promise.all([
    // The name goes into the agent's instructions ("You are the support assistant for BrewBox").
    workspaces.findOne({ _id: new ObjectId(workspaceId) }, { projection: { name: 1 } }),
    loadMessages(conversation._id),
  ]);

  // Built on the server from plain text: a client can't inject tool results or fake assistant turns.
  const userMessage: DeskmateUIMessage = {
    id: generateId(),
    role: 'user',
    parts: [{ type: 'text', text }],
    metadata: { createdAt: Date.now() },
  };
  await saveMessage(conversation, userMessage);
  const reopen = isWidget && conversation.status === 'closed';
  const current = await updateConversation(conversation, {
    ...(history.length === 0 ? { title: text.slice(0, TITLE_LENGTH) } : {}),
    ...(reopen ? { status: 'open' as const } : {}),
  });
  if (isWidget) publishMessage(workspaceId, conversation._id.toString(), userMessage);
  if (reopen) publishStatus(conversation._id.toString(), 'open');

  // A person is handling this chat: the message waits in their inbox, and the bot doesn't answer.
  if (isWidget && current.status === 'handed_off') return emptyReply();

  async function saveReply({ message, handoffReason, errored }: AgentReply) {
    try {
      // A failed reply isn't stored: the user saw an error and can send again.
      if (!errored) {
        await saveMessage(conversation, message);
        if (isWidget) publishMessage(workspaceId, conversation._id.toString(), message);
      }
      await updateConversation(conversation, handoffReason ? { status: 'handed_off', handoffReason } : {});
      if (isWidget && handoffReason) publishStatus(conversation._id.toString(), 'handed_off');
      console.log(
        JSON.stringify({
          event: 'chat',
          channel: conversation.channel,
          conversationId: conversation._id.toString(),
          errored,
          handoffReason,
          topScore: message.metadata?.topScore,
          // Tool names only: tool inputs can hold customer emails, which don't belong in logs.
          tools: message.parts.flatMap((part) => (part.type.startsWith('tool-') ? [part.type.slice(5)] : [])),
          latencyMs: message.metadata?.latencyMs,
          usage: message.metadata?.usage,
        }),
      );
    } catch (err) {
      console.error('Failed to save reply', err);
    }
  }

  return streamSupportAgent({
    workspaceId,
    workspaceName: workspace?.name ?? 'this company',
    history,
    userMessage,
    onEnd: saveReply,
  });
}

/**
 * A team member replies from the inbox. Replying also takes the chat over (status handed_off), so the bot
 * stops answering, even if it hadn't handed off itself: an agent can step into any chat.
 */
export async function addHumanReply(
  conversation: WithId<ConversationRecord>,
  text: string,
  sender: HumanSender,
): Promise<DeskmateUIMessage> {
  if (conversation.channel !== 'widget') throw new HttpError(409, 'Only customer chats can be answered from the inbox');
  const message: DeskmateUIMessage = {
    id: generateId(),
    role: 'assistant',
    parts: [{ type: 'text', text }],
    metadata: { createdAt: Date.now(), sender },
  };
  await saveMessage(conversation, message);
  publishMessage(conversation.workspaceId, conversation._id.toString(), message);
  await updateConversation(conversation, { status: 'handed_off' });
  if (conversation.status !== 'handed_off') publishStatus(conversation._id.toString(), 'handed_off');
  return message;
}

/** "Hand back to the bot" (open) or "close", from the inbox. */
export async function setConversationStatus(
  conversation: WithId<ConversationRecord>,
  status: 'open' | 'closed',
): Promise<Conversation> {
  if (conversation.channel !== 'widget') throw new HttpError(409, 'Only customer chats have an inbox status');
  const updated = await updateConversation(conversation, { status });
  publishStatus(conversation._id.toString(), status);
  return toConversation(updated);
}
