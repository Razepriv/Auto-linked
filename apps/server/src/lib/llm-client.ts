// ---------------------------------------------------------------------------
// OpenAI-compatible LLM client — works with Groq, OpenRouter, OpenAI, etc.
// ---------------------------------------------------------------------------

import OpenAI from 'openai';
import { config } from './config.js';
import { logger } from './logger.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client === null) {
    client = new OpenAI({
      apiKey: config.LLM_API_KEY,
      baseURL: config.LLM_BASE_URL,
    });
    logger.info(
      { baseURL: config.LLM_BASE_URL, model: config.LLM_MODEL },
      'LLM client initialized',
    );
  }
  return client;
}

/**
 * Send a chat completion request and return the text response.
 *
 * @param system   - System prompt
 * @param user     - User prompt
 * @param maxTokens - Maximum tokens in the response
 * @returns The assistant's text response
 */
export async function chatCompletion(
  system: string,
  user: string,
  maxTokens: number = 2048,
): Promise<string> {
  const response = await getClient().chat.completions.create({
    model: config.LLM_MODEL,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('LLM response contained no content');
  }

  return content;
}

/**
 * Send a chat completion with only a user message (no system prompt).
 */
export async function chatCompletionSimple(
  user: string,
  maxTokens: number = 1024,
): Promise<string> {
  const response = await getClient().chat.completions.create({
    model: config.LLM_MODEL,
    max_tokens: maxTokens,
    messages: [
      { role: 'user', content: user },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('LLM response contained no content');
  }

  return content;
}
