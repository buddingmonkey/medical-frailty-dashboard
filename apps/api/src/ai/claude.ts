import Anthropic from '@anthropic-ai/sdk'

// The optional AI cleanup call (docs/ingestion.md, "AI cleanup"). Only used when the
// ANTHROPIC_API_KEY secret is set; tests pass a fake instead (AppDeps.aiComplete).

export interface AiCompletion {
  text: string
  /** The model that answered (a refusal fallback can change it). */
  model: string
  stopReason: string | null
  inputTokens: number
  outputTokens: number
}

export type AiComplete = (apiKey: string, model: string, prompt: string) => Promise<AiCompletion>

/** Default model; the AI_MODEL Worker variable overrides it without a code change. */
export const DEFAULT_AI_MODEL = 'claude-opus-5-5'

export const claudeComplete: AiComplete = async (apiKey, model, prompt) => {
  const client = new Anthropic({ apiKey, maxRetries: 1 })
  // Streaming: one part can be tens of thousands of output tokens. A policy decline re-runs
  // on Anthropic's recommended fallback model instead of failing the part.
  const message = await client.beta.messages
    .stream({
      model,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: prompt }],
    })
    .finalMessage()
  let text = ''
  for (const block of message.content) if (block.type === 'text') text += block.text
  return {
    text,
    model: message.model,
    stopReason: message.stop_reason,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  }
}
