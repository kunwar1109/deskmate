import { HANDOFF_MESSAGE, type DeskmateUIMessage } from '@deskmate/shared/chat';
import { describe, expect, it } from '@jest/globals';
import { toModelHistory } from '../../src/lib/agent.js';

const text = (id: string, role: 'user' | 'assistant', value: string, metadata?: DeskmateUIMessage['metadata']): DeskmateUIMessage => ({
  id,
  role,
  parts: [{ type: 'text', text: value }],
  ...(metadata ? { metadata } : {}),
});

describe('toModelHistory (what the model sees of earlier turns)', () => {
  it('keeps only the words, without citation markers or tool calls', () => {
    const reply: DeskmateUIMessage = {
      id: 'a',
      role: 'assistant',
      parts: [
        { type: 'tool-searchDocs', toolCallId: 'c', state: 'output-available', input: { query: 'q' }, output: { found: true, bestScore: 0.9, passages: [] } },
        { type: 'text', text: 'Explorer is ₹1,299 [1][2].' },
      ],
    };
    expect(toModelHistory([text('u', 'user', 'How much is Explorer?'), reply])).toEqual([
      { role: 'user', content: 'How much is Explorer?' },
      { role: 'assistant', content: 'Explorer is ₹1,299.' },
    ]);
  });

  it('shows a handoff as the message the customer actually saw', () => {
    const handoff = text('a', 'assistant', 'model text', { handoffReason: 'not_in_docs' });
    expect(toModelHistory([handoff])).toEqual([{ role: 'assistant', content: HANDOFF_MESSAGE }]);
  });

  it('merges two customer messages in a row (after a failed reply) so roles alternate', () => {
    expect(toModelHistory([text('1', 'user', 'Hello?'), text('2', 'user', 'Anyone there?')])).toEqual([
      { role: 'user', content: 'Hello?\n\nAnyone there?' },
    ]);
  });

  it('keeps only the last 12 messages', () => {
    const many = Array.from({ length: 20 }, (_, i) => text(String(i), i % 2 ? 'assistant' : 'user', `m${i}`));
    const history = toModelHistory(many);
    expect(history).toHaveLength(12);
    expect(history[0]).toEqual({ role: 'user', content: 'm8' });
  });
});
