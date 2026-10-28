import { describe, expect, it, jest } from '@jest/globals';
import { APICallError, RetryError } from 'ai';
import { describeAiError } from '../../src/lib/ai-errors.js';

const rateLimited = () =>
  new APICallError({ message: 'Quota exceeded', url: 'https://gemini', requestBodyValues: {}, statusCode: 429 });

describe('describeAiError (what the customer reads when Gemini fails mid-reply)', () => {
  it('explains a rate limit, also when it comes wrapped in a RetryError', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const busy = 'The AI service is busy right now. Please try again in a minute.';
    expect(describeAiError(rateLimited())).toBe(busy);
    expect(describeAiError(new RetryError({ message: 'failed', reason: 'maxRetriesExceeded', errors: [rateLimited()] }))).toBe(busy);
    warn.mockRestore();
  });

  it('explains a timeout', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const timeout = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    expect(describeAiError(timeout)).toMatch(/took too long/);
    warn.mockRestore();
  });

  it('never leaks internal error details', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(describeAiError(new Error('MONGODB_URI=mongodb+srv://secret@cluster'))).toBe('Something went wrong. Please try again.');
    error.mockRestore();
  });
});
