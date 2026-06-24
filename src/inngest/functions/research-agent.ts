import { researchSteps, researchSessionId } from "@/content/research-demo";
import {
  inngest,
  researchRunCompleted,
  researchRunRequested,
  type ResearchRunRequestedData,
} from "@/inngest/client";
import {
  resetResearchCrashState,
  runResearchCall,
  summarizeResearchRun,
} from "@/lib/mock-research";
import { isCloud } from "@/lib/demo-target";

export type ResearchAgentResult = ReturnType<typeof summarizeResearchRun> & {
  parentRunId?: string;
};

export const researchAgent = inngest.createFunction(
  {
    id: "research-agent",
    retries: 4,
    triggers: [
      researchRunRequested,
      { cron: "TZ=America/Los_Angeles 0 9 */6 * *" },
    ],
  },
  async ({ event, step, attempt, runId }): Promise<ResearchAgentResult> => {
    const data = event.data as Partial<ResearchRunRequestedData>;
    const researchRunId =
      data.researchRunId ?? `scheduled-research-${new Date().toISOString()}`;
    const model = data.model ?? "gpt-5.5";
    const failureStep = data.failureStep ?? "fetch-competitor-changelog";
    const latencyMs = data.latencyMs ?? 0;

    if (attempt === 0) {
      resetResearchCrashState();
    }

    const productContext = await step.run("load-product-context", () =>
      runResearchCall("load-product-context", { attempt, failStep: failureStep, latencyMs })
    );
    const notionRoadmap = await step.run("fetch-notion-roadmap", () =>
      runResearchCall("fetch-notion-roadmap", { attempt, failStep: failureStep, latencyMs })
    );
    const confluenceRfps = await step.run("fetch-confluence-rfps", () =>
      runResearchCall("fetch-confluence-rfps", { attempt, failStep: failureStep, latencyMs })
    );
    const googleDocsNotes = await step.run("fetch-google-docs-notes", () =>
      runResearchCall("fetch-google-docs-notes", { attempt, failStep: failureStep, latencyMs })
    );
    const slackWinLoss = await step.run("fetch-slack-win-loss", () =>
      runResearchCall("fetch-slack-win-loss", { attempt, failStep: failureStep, latencyMs })
    );
    const crmDeals = await step.run("fetch-crm-deals", () =>
      runResearchCall("fetch-crm-deals", { attempt, failStep: failureStep, latencyMs })
    );
    const supportTickets = await step.run("fetch-support-tickets", () =>
      runResearchCall("fetch-support-tickets", { attempt, failStep: failureStep, latencyMs })
    );
    const churnReasons = await step.run("fetch-churn-reasons", () =>
      runResearchCall("fetch-churn-reasons", { attempt, failStep: failureStep, latencyMs })
    );
    const pricingPages = await step.run("fetch-pricing-pages", () =>
      runResearchCall("fetch-pricing-pages", { attempt, failStep: failureStep, latencyMs })
    );
    const competitorChangelog = await step.run("fetch-competitor-changelog", () =>
      runResearchCall("fetch-competitor-changelog", {
        attempt,
        failStep: failureStep,
        latencyMs,
      })
    );
    const webSearch = await step.run("run-parallel-web-search", () =>
      runResearchCall("run-parallel-web-search", { attempt, failStep: failureStep, latencyMs })
    );
    const aiSearch = await step.run("run-ai-search", () =>
      runResearchCall("run-ai-search", { attempt, failStep: failureStep, latencyMs })
    );
    const g2Reviews = await step.run("query-g2-reviews", () =>
      runResearchCall("query-g2-reviews", { attempt, failStep: failureStep, latencyMs })
    );
    const githubIssues = await step.run("query-github-issues", () =>
      runResearchCall("query-github-issues", { attempt, failStep: failureStep, latencyMs })
    );
    const communityForum = await step.run("query-community-forum", () =>
      runResearchCall("query-community-forum", { attempt, failStep: failureStep, latencyMs })
    );
    const normalizedEvidence = await step.run("normalize-evidence", () =>
      runResearchCall("normalize-evidence", { attempt, failStep: failureStep, latencyMs })
    );
    const rankedFindings = await step.run("rank-findings", () =>
      runResearchCall("rank-findings", { attempt, failStep: failureStep, latencyMs })
    );
    const brief = await step.run("synthesize-brief", () =>
      runResearchCall("synthesize-brief", { attempt, failStep: failureStep, latencyMs })
    );
    const published = await step.run("publish-brief", () =>
      runResearchCall("publish-brief", { attempt, failStep: failureStep, latencyMs })
    );
    await step.run("notify-stakeholders", () =>
      runResearchCall("notify-stakeholders", { attempt, failStep: failureStep, latencyMs })
    );

    const summary = summarizeResearchRun({ researchRunId, model });
    const sources = [
      productContext,
      notionRoadmap,
      confluenceRfps,
      googleDocsNotes,
      slackWinLoss,
      crmDeals,
      supportTickets,
      churnReasons,
      pricingPages,
      competitorChangelog,
      webSearch,
      aiSearch,
      g2Reviews,
      githubIssues,
      communityForum,
      normalizedEvidence,
      rankedFindings,
      brief,
      published,
    ].map((item) => item.source);

    // Act 2's addition in the code view: this event is the durable boundary
    // that lets the scoring/session function attach eval data to this run.
    await step.sendEvent(
      "score-and-session",
      researchRunCompleted.create(
        {
          ...summary,
          parentRunId: isCloud ? runId : researchRunId,
          sessionId: researchSessionId,
          sources: [...new Set(sources)],
          source: "booth-demo",
        },
        { id: `research-completed:${researchRunId}` }
      )
    );

    return {
      ...summary,
      parentRunId: isCloud ? runId : undefined,
    };
  }
);

export const researchStepCount = researchSteps.length;
