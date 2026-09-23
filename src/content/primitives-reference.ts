// The core primitives the whole demo runs on, shown as a strip on the Recap
// screen with "Under the hood" on. Each card: the primitive's product name,
// its SDK name, and a one-line booth tagline.

export type PrimitiveCard = {
  id: string;
  name: string;
  sdk: string;
  tagline: string;
};

export const primitiveCards: PrimitiveCard[] = [
  {
    id: "event",
    name: "Event",
    sdk: "inngest.send",
    tagline: "A typed event triggers the work and carries the ticket.",
  },
  {
    id: "function",
    name: "Function",
    sdk: "createFunction",
    tagline: "The durable unit of work: retries, concurrency, cancellation.",
  },
  {
    id: "step",
    name: "Step",
    sdk: "step.run",
    tagline: "The durability boundary. Each step retries and replays alone.",
  },
  {
    id: "score",
    name: "Metric",
    sdk: "step.score",
    tagline: "Any judgement, human or automated, lands on the run it judged.",
  },
  // Last on purpose: Experiment composes Step and Metric, so it reads as the
  // payoff of the arc rather than another primitive in the list.
  {
    id: "experiment",
    name: "Experiment",
    sdk: "group.experiment",
    tagline:
      "Split real traffic across variants of anything, and measure each one.",
  },
];
