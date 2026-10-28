import type { Conversation, DeskmateUIMessage } from '@deskmate/shared/chat';
import { generateId, type InferUIMessageChunk } from 'ai';
import { ObjectId, type WithId } from 'mongodb';
import { conversations, messages, workspaces, type ConversationRecord, type MessageRecord } from '../db.js';
import { streamSupportAgent, type AgentReply } from './agent.js';
import { HttpError } from './errors.js';

/**
 * Conversation logic shared by the dashboard playground (routes/conversations.ts) and the public
 * widget API (routes/public.ts). The routes only differ in who may call them and what they send back.
 */

const TITLE_LENGTH = 80;

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
  return { id: doc.messageId, role: doc.role, parts: doc.parts, ...(doc.metadata ? { metadata: doc.metadata } : {}) };
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

export async function loadMessages(conversationId: ObjectId): Promise<DeskmateUIMessage[]> {
  const docs = await messages.find({ conversationId }).sort({ createdAt: 1, _id: 1 }).toArray();
  return docs.map(toUIMessage);
}

/**
 * Saves the customer's message, runs the agent, and returns its reply as a UI message stream.
 * The reply is saved when the agent finishes, even if the client has disconnected by then.
 */
export async function replyToMessage(
  conversation: WithId<ConversationRecord>,
  text: string,
): Promise<ReadableStream<InferUIMessageChunk<DeskmateUIMessage>>> {
  const { workspaceId } = conversation;
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
  await messages.insertOne({
    workspaceId,
    conversationId: conversation._id,
    messageId: userMessage.id,
    role: 'user',
    parts: userMessage.parts,
    metadata: userMessage.metadata,
    createdAt: new Date(),
  });
  await conversations.updateOne(
    { _id: conversation._id, workspaceId },
    { $set: { updatedAt: new Date(), ...(history.length === 0 ? { title: text.slice(0, TITLE_LENGTH) } : {}) } },
  );

  async function saveReply({ message, handoffReason, errored }: AgentReply) {
    try {
      // A failed reply isn't stored: the user saw an error and can send again.
      if (!errored) {
        await messages.insertOne({
          workspaceId,
          conversationId: conversation._id,
          messageId: message.id,
          role: 'assistant',
          parts: message.parts,
          metadata: message.metadata,
          createdAt: new Date(),
        });
      }
      await conversations.updateOne(
        { _id: conversation._id, workspaceId },
        { $set: { updatedAt: new Date(), ...(handoffReason ? { status: 'handed_off' as const, handoffReason } : {}) } },
      );
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
