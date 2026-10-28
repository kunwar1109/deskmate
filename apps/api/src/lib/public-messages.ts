import { HANDOFF_MESSAGE, type DeskmateUIMessage, type SearchDocsOutput } from '@deskmate/shared/chat';
import type { CitedSource, WidgetUIMessage } from '@deskmate/shared/widget';
import type { InferUIMessageChunk } from 'ai';

/**
 * Customers see the answer, not the machinery. The owner's stream carries tool calls, similarity
 * scores, token usage and the agent's note for the team; none of that should reach the widget.
 * This is an allowlist: only text, step markers, errors and our own source lists get through,
 * so a field added to the owner's stream later stays private by default.
 *
 * The same projection exists twice: once for the live stream, once for history loaded from the database.
 */

type OwnerChunk = InferUIMessageChunk<DeskmateUIMessage>;
type WidgetChunk = InferUIMessageChunk<WidgetUIMessage>;

function toCitedSources(output: SearchDocsOutput): CitedSource[] {
  return output.passages.map(({ n, title, page }) => ({ n, title, ...(page !== undefined ? { page } : {}) }));
}

/** Filters a live reply stream for the widget. */
export function toPublicStream(stream: ReadableStream<OwnerChunk>): ReadableStream<WidgetChunk> {
  const searchCalls = new Set<string>(); // toolCallIds of searchDocs calls, to recognise their outputs

  return stream.pipeThrough(
    new TransformStream<OwnerChunk, WidgetChunk>({
      transform(chunk, controller) {
        switch (chunk.type) {
          case 'start':
            controller.enqueue({
              type: 'start',
              ...(chunk.messageId ? { messageId: chunk.messageId } : {}),
              messageMetadata: { createdAt: chunk.messageMetadata?.createdAt },
            });
            return;
          case 'tool-input-start':
            if (chunk.toolName === 'searchDocs') searchCalls.add(chunk.toolCallId);
            return;
          case 'tool-output-available':
            if (searchCalls.has(chunk.toolCallId)) {
              controller.enqueue({ type: 'data-sources', data: toCitedSources(chunk.output as SearchDocsOutput) });
            }
            return;
          case 'finish': {
            const handedOff = chunk.messageMetadata?.handoffReason !== undefined;
            // The owner's UI renders the handoff from the tool call; the customer just gets the fixed message as text.
            if (handedOff) {
              controller.enqueue({ type: 'text-start', id: 'handoff' });
              controller.enqueue({ type: 'text-delta', id: 'handoff', delta: HANDOFF_MESSAGE });
              controller.enqueue({ type: 'text-end', id: 'handoff' });
            }
            controller.enqueue({
              type: 'finish',
              ...(chunk.finishReason ? { finishReason: chunk.finishReason } : {}),
              messageMetadata: { handedOff },
            });
            return;
          }
          case 'text-start':
          case 'text-delta':
          case 'text-end':
          case 'start-step':
          case 'finish-step':
          case 'error':
          case 'abort':
            controller.enqueue(chunk);
            return;
          default:
            return; // every other chunk (tool calls, metadata updates, reasoning) stays on the server
        }
      },
    }),
  );
}

/** The same projection for a stored message, when the widget reloads a chat. */
export function toWidgetMessage(message: DeskmateUIMessage): WidgetUIMessage {
  const parts: WidgetUIMessage['parts'] = [];
  for (const part of message.parts) {
    if (part.type === 'text') parts.push({ type: 'text', text: part.text });
    if (part.type === 'tool-searchDocs' && part.state === 'output-available') {
      parts.push({ type: 'data-sources', data: toCitedSources(part.output) });
    }
  }
  const handedOff = message.metadata?.handoffReason !== undefined;
  if (handedOff) parts.push({ type: 'text', text: HANDOFF_MESSAGE });

  return {
    id: message.id,
    role: message.role,
    parts,
    metadata: {
      ...(message.metadata?.createdAt !== undefined ? { createdAt: message.metadata.createdAt } : {}),
      ...(message.role === 'assistant' ? { handedOff } : {}),
    },
  };
}
