import { FastifyRequest, FastifyReply } from "fastify";
import { trace } from "../observability/Trace";

/**
 * ProgressController handles pipeline progress/trace endpoints
 */
export class ProgressController {
  /**
   * GET /pipeline/progress/:run_id
   * Get pipeline execution progress and trace
   */
  async getPipelineProgress(
    request: FastifyRequest<{ Params: { run_id: string } }>,
    reply: FastifyReply
  ) {
    const { run_id } = request.params;

    const pipelineTrace = trace.getTrace(run_id);
    if (!pipelineTrace) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: "PIPELINE_RUN_NOT_FOUND",
          message: `Pipeline run not found: ${run_id}`,
          run_id,
        },
      });
    }

    // Map spans to API format
    const traceData = pipelineTrace.spans.map((span) => {
      let status: "pending" | "running" | "success" | "error";
      if (span.status === "started") {
        status = "running";
      } else if (span.status === "completed") {
        status = "success";
      } else if (span.status === "failed") {
        status = "error";
      } else {
        status = "pending";
      }

      return {
        span_id: span.spanId,
        name: span.name,
        started_at: span.startTime,
        finished_at: span.endTime,
        status,
        metadata: span.metadata,
      };
    });

    return reply.code(200).send({
      ok: true,
      run_id,
      trace: traceData,
    });
  }
}
