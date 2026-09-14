const apiKey = process.env.OPENROUTER_API_KEY?.trim();
const baseUrl =
  process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";

export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-5.5";

export function isOpenRouterConfigured(): boolean {
  return Boolean(apiKey);
}

export type OpenRouterCompletion = {
  text: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

/**
 * Minimal OpenRouter chat-completion client. Plain fetch on purpose: no SDK
 * dependency, and the booth demo must run identically with no key (mocked
 * model calls) and with one (real calls). Throws on transport/HTTP errors so
 * the surrounding durable step retries naturally.
 */
export async function completeChat(args: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<OpenRouterCompletion> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "http-referer": "https://agent-evals-demo.onrender.com",
      "x-title": "Inngest booth demo",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      // Reasoning models burn budget on hidden reasoning before any visible
      // content; a small cap yields empty completions (finish_reason=length).
      max_tokens: args.maxTokens ?? 2048,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter ${response.status}: ${body.slice(0, 300) || response.statusText}`,
    );
  }

  const payload = (await response.json()) as {
    model?: string;
    choices?: Array<{
      message?: { content?: string | null; reasoning?: string | null };
      finish_reason?: string | null;
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const choice = payload.choices?.[0];
  const text = choice?.message?.content?.trim() ?? "";
  const usage = {
    promptTokens: payload.usage?.prompt_tokens ?? 0,
    completionTokens: payload.usage?.completion_tokens ?? 0,
    totalTokens: payload.usage?.total_tokens ?? 0,
  };

  if (!text) {
    // Never fail silently: name the likely cause so the retry error in the
    // Inngest trace is actionable (length = raise max_tokens, content_filter
    // = prompt issue, reasoning-only = reasoning model with a small budget).
    const details = [
      choice?.finish_reason ? `finish_reason=${choice.finish_reason}` : null,
      choice?.message?.reasoning ? "reasoning-only response" : null,
      `tokens=${usage.totalTokens}`,
      `model=${payload.model ?? OPENROUTER_MODEL}`,
    ]
      .filter(Boolean)
      .join(", ");

    throw new Error(
      `OpenRouter returned an empty completion (${details || "no choices returned"})`,
    );
  }

  return {
    text,
    model: payload.model ?? OPENROUTER_MODEL,
    usage,
  };
}
