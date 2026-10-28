import { APICallError, RetryError } from 'ai';

/**
 * Turns a failure during a streamed reply into one line the user can read, and logs the details.
 * A stream has already sent "200 OK" by the time Gemini fails, so these can't become HTTP status codes:
 * the message travels inside the stream as an error part instead.
 */
export function describeAiError(err: unknown): string {
  const providerError = RetryError.isInstance(err) ? err.lastError : err;
  if (APICallError.isInstance(providerError) && providerError.statusCode === 429) {
    console.warn('Gemini rate limit hit:', providerError.message.split('\n')[0]);
    return 'The AI service is busy right now. Please try again in a minute.';
  }
  if (err instanceof Error && err.name === 'TimeoutError') {
    console.warn('Agent timed out');
    return 'The AI service took too long to respond. Please try again.';
  }
  console.error(err);
  return 'Something went wrong. Please try again.';
}
