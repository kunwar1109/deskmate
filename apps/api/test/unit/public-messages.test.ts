import { HANDOFF_MESSAGE, type DeskmateUIMessage } from '@deskmate/shared/chat';
import { describe, expect, it } from '@jest/globals';
import type { InferUIMessageChunk } from 'ai';
import { toPublicStream, toWidgetMessage } from '../../src/lib/public-messages.js';
import { fakeReply } from '../helpers.js';

type Chunk = InferUIMessageChunk<DeskmateUIMessage>;

async function filter(chunks: Chunk[]) {
  const source = new ReadableStream<Chunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const out: unknown[] = [];
  const reader = toPublicStream(source).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

describe('toWidgetMessage (stored message -> what a customer may see)', () => {
  it('keeps the answer and source titles, drops tool calls, scores and usage', () => {
    const message = toWidgetMessage(fakeReply());
    expect(message.parts).toEqual([
      { type: 'data-sources', data: [{ n: 1, title: 'Help Center' }] },
      { type: 'text', text: 'The Explorer plan costs ₹1,299 [1].' },
    ]);
    const json = JSON.stringify(message);
    for (const secret of ['score', 'usage', 'topScore', 'documentId', 'tool-', 'explorer price']) {
      expect(json).not.toContain(secret);
    }
  });

  it('turns a handoff into the fixed customer message, without the note for the team', () => {
    const message = toWidgetMessage({
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-handoffToHuman',
          toolCallId: 'h1',
          state: 'output-available',
          input: { reason: 'needs_human', summary: 'Angry about a refund, VIP customer' },
          output: { message: HANDOFF_MESSAGE },
        },
      ],
      metadata: { handoffReason: 'needs_human' },
    });
    expect(message.parts).toEqual([{ type: 'text', text: HANDOFF_MESSAGE }]);
    expect(message.metadata).toEqual({ handedOff: true });
    expect(JSON.stringify(message)).not.toContain('VIP');
  });

  it("shows a team member's name on their replies", () => {
    const message = toWidgetMessage({
      id: 'm2',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Sending a replacement today.' }],
      metadata: { createdAt: 1, sender: { kind: 'human', name: 'Priya' } },
    });
    expect(message.metadata).toEqual({ createdAt: 1, handedOff: false, sender: { kind: 'human', name: 'Priya' } });
  });
});

describe('toPublicStream (live reply -> what a customer may see)', () => {
  it('lets text through and turns search results into source titles only', async () => {
    const out = await filter([
      { type: 'start', messageId: 'r1', messageMetadata: { createdAt: 5 } },
      { type: 'tool-input-start', toolCallId: 'c1', toolName: 'searchDocs' },
      { type: 'tool-input-available', toolCallId: 'c1', toolName: 'searchDocs', input: { query: 'secret query' } },
      {
        type: 'tool-output-available',
        toolCallId: 'c1',
        output: { found: true, bestScore: 0.9, passages: [{ n: 1, documentId: 'd', title: 'Help', score: 0.9, text: 'internal' }] },
      },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: 'Hi [1]' },
      { type: 'text-end', id: 't' },
      { type: 'finish', messageMetadata: { latencyMs: 1, usage: { inputTokens: 9 }, topScore: 0.9 } },
    ]);
    expect(out).toEqual([
      { type: 'start', messageId: 'r1', messageMetadata: { createdAt: 5 } },
      { type: 'data-sources', data: [{ n: 1, title: 'Help' }] },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: 'Hi [1]' },
      { type: 'text-end', id: 't' },
      { type: 'finish', messageMetadata: { handedOff: false } },
    ]);
  });

  it('replaces a handoff tool call with the fixed message as text', async () => {
    const out = await filter([
      { type: 'start', messageId: 'r2' },
      { type: 'tool-input-start', toolCallId: 'h', toolName: 'handoffToHuman' },
      { type: 'tool-output-available', toolCallId: 'h', output: { message: HANDOFF_MESSAGE } },
      { type: 'finish', messageMetadata: { handoffReason: 'not_in_docs' } },
    ]);
    expect(out).toContainEqual({ type: 'text-delta', id: 'handoff', delta: HANDOFF_MESSAGE });
    expect(out.at(-1)).toEqual({ type: 'finish', messageMetadata: { handedOff: true } });
    expect(JSON.stringify(out)).not.toContain('not_in_docs');
  });
});
