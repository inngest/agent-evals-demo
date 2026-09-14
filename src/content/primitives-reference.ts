// Reference cards for the Primitives tab on the loop demo's code pane.
// Intentionally minimal: the four core primitives the whole demo runs on.
// Each card: the primitive's name, a one-line booth tagline, and a short
// signature lifted from (or matching) the demo's real code.

export type PrimitiveCard = {
  id: string;
  name: string;
  tagline: string;
  code: string;
};

const eventCode = `export const researchRunRequested = eventType(
  "research/run.requested",
  { schema: staticSchema<ResearchRunRequestedData>() }
);

await inngest.send({ name: researchRunRequested, data });`;

const functionCode = `export const researchAgent = inngest.createFunction(
  { id: "research-agent", retries: 4, triggers: [researchRunRequested] },
  async ({ event, step }) => { /* ... */ }
);`;

const stepCode = `const changelog = await step.run(
  "fetch-competitor-changelog",
  () => fetchResearchCorpus.competitorChangelog(competitors)
);`;

const scoreCode = `export const researchQualityScorer = createScorer(
  inngest,
  { id: "research-quality-scorer" },
  async ({ event, step }) => ({ name: "research_quality", value: score })
);`;

export const primitiveCards: PrimitiveCard[] = [
  {
    id: "event",
    name: "Event",
    tagline: "Typed events trigger work and carry the payload. Any producer.",
    code: eventCode,
  },
  {
    id: "function",
    name: "Function",
    tagline: "The durable unit of work. Retries, concurrency, cancellation.",
    code: functionCode,
  },
  {
    id: "step",
    name: "Step",
    tagline: "The durability boundary. Each step retries and replays alone.",
    code: stepCode,
  },
  {
    id: "score",
    name: "Score",
    tagline: "Your rubric becomes a durable score attached to the run.",
    code: scoreCode,
  },
];
