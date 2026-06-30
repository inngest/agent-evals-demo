import {
  ConsoleSpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export async function register() {
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "inngest-agent",
    }),
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
  });

  // register() sets the global TracerProvider and an AsyncLocalStorage-based
  // context manager so spans nest correctly across async/step boundaries.
  console.log("register!");
  provider.register();

  await import("@inngest/otel/node");
}
