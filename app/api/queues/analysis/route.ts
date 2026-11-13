import { handleCallback } from "@vercel/queue";
import { loadAnalysisContext, performStage } from "@/lib/analyse/execute";
import { countDistinctTracks } from "@/lib/analyse/tracks";
import {
  enqueueAnalysis,
  handleAnalysisDelivery,
  QUEUE_MAX_DELIVERIES,
  type AnalysisMessage,
} from "@/lib/analyse/queue";
import { markRunFailed, saveAnalysisRun } from "@/lib/analysis-run";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = handleCallback<AnalysisMessage>(
  async (message, metadata) => {
    await handleAnalysisDelivery({
      message,
      messageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
      perform: performStage,
      load: loadAnalysisContext,
      enqueue: async (next, idempotencyKey) => {
        await enqueueAnalysis(next, idempotencyKey);
      },
      save: saveAnalysisRun,
      countTracks: countDistinctTracks,
      fail: async (runId, userId, messageText) => {
        await markRunFailed(runId, userId, messageText);
      },
    });
  },
  {
    visibilityTimeoutSeconds: 300,
    retry: (_error, metadata) => (metadata.deliveryCount >= QUEUE_MAX_DELIVERIES ? { acknowledge: true } : undefined),
  },
);
