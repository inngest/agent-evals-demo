import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
} from "@opentelemetry/semantic-conventions/incubating";

const tracer = trace.getTracer("inngest-agent");

function sleep(duration: number) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

export async function startSpan(name: string, attributes: Record<string, any>) {
  return await tracer.startSpan(name, {
    attributes: attributes,
  });
}
export async function startGenAISpan(
  name: string,
  attributes: Record<string, any>,
) {
  return await tracer.startSpan(name, {
    attributes: {
      [ATTR_GEN_AI_REQUEST_MODEL]: "claude-opus-4-8",
      [ATTR_GEN_AI_OPERATION_NAME]: "chat",
      [ATTR_GEN_AI_PROVIDER_NAME]: "anthropic",
      [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 123,
      [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 1498,
      [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 3218,

      "gen_ai.input.messages":
        '[{"role":"user","parts":[{"type":"text","content":"A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Reason step by step before giving your final answer."}]}]',

      ...attributes,
    },
  });
}

export async function createSpan(
  name: string,
  attributes: Record<string, any>,
  duration: number,
) {
  const span = await tracer.startSpan(name, {
    attributes: attributes,
  });

  await sleep(duration);

  await span.end();
}

export async function startPostSpan(url: string) {
  const urlParts = new URL(url);
  return await startSpan("POST", {
    "http.request.method": "POST",
    "http.request.method_original": "POST",
    "http.response.status_code": 200,
    // 'network.peer.address': '::1',
    // 'network.peer.port': 8288,
    // 'server.address': 'localhost',
    // 'server.port': 80,
    "url.full": url,
    "url.path": urlParts.pathname,
    "url.query": urlParts.search || "",
    "url.scheme": urlParts.protocol,
    "user_agent.original": "node",
  });
}

export async function get(url: string, duration: number, mockResponse: any) {
  const urlParts = new URL(url);
  await createSpan(
    "DNS LOOKUP",
    {
      "dns.lookup.name": urlParts.hostname,
    },
    duration / (10 - Math.random() * 5),
  );
  await createSpan(
    "GET",
    {
      "http.request.method": "GET",
      "http.request.method_original": "GET",
      "http.response.status_code": 200,
      // 'network.peer.address': '::1',
      // 'network.peer.port': 8288,
      // 'server.address': 'localhost',
      // 'server.port': 80,
      "url.full": url,
      "url.path": urlParts.pathname,
      "url.query": urlParts.search || "",
      "url.scheme": urlParts.protocol,
      "user_agent.original": "node",
    },
    duration,
  );
  return mockResponse;
}
