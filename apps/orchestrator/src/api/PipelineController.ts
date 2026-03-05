import { FastifyRequest, FastifyReply } from "fastify";
import { PipelineEngine } from "../pipeline/PipelineEngine";
import { trace } from "../observability/Trace";
import { logger } from "../observability/Logger";
import { scheduledCleanupManager } from "../observability/ScheduledCleanup";
import { ArchitectConfig } from "../core/orchestratorCore";
import {
  RunPipelineRequest,
  RunPipelineRequestSchema,
  DomainExclusion,
  RoleConfigsInput,
} from "./validators";
import { PipelineExecutionState } from "@llm/shared-types";
import { LRUCache } from "@llm/shared-utils";

/**
 * Maximum number of pipeline runs to keep in cache
 * Requirements: 13.1 - LRU cache with max size 100
 */
const ACTIVE_RUNS_MAX_SIZE = 100;

/**
 * Time in milliseconds after which completed runs can be cleaned up
 * Requirements: 13.2 - Schedule cleanup after 1 hour
 */
const COMPLETED_RUN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Stored run entry with completion timestamp for TTL-based cleanup
 */
interface StoredRunEntry {
  result: any;
  completedAt: number;
}

/**
 * PipelineController handles pipeline execution endpoints
 */
export class PipelineController {
  private pipelineEngine: PipelineEngine;
  private config: ArchitectConfig;
  /**
   * LRU cache for storing active pipeline run results
   * Requirements: 13.1 - Implement LRU cache with max size 100
   * Automatically evicts least recently used entries when capacity is reached
   */
  private activeRuns: LRUCache<string, StoredRunEntry> = new LRUCache<string, StoredRunEntry>(ACTIVE_RUNS_MAX_SIZE);

  constructor(pipelineEngine: PipelineEngine, config: ArchitectConfig) {
    this.pipelineEngine = pipelineEngine;
    this.config = config;
    
    // Register cleanup callback with the scheduled cleanup manager
    // Requirements: 13.2 - Schedule cleanup after 1 hour
    scheduledCleanupManager.registerActiveRunsCleanup(() => this.cleanupCompletedRuns());
  }

  /**
   * Cleanup completed runs that are older than TTL
   * 
   * Requirements: 13.2 - Schedule cleanup after 1 hour
   * 
   * @returns Number of runs removed
   */
  private cleanupCompletedRuns(): number {
    const now = Date.now();
    let removedCount = 0;
    const keysToRemove: string[] = [];

    // Find entries older than TTL
    this.activeRuns.forEach((entry, key) => {
      if (entry.completedAt && (now - entry.completedAt) > COMPLETED_RUN_TTL_MS) {
        keysToRemove.push(key);
      }
    });

    // Remove old entries
    for (const key of keysToRemove) {
      this.activeRuns.delete(key);
      removedCount++;
    }

    return removedCount;
  }

  /**
   * POST /pipeline/run
   * Start a new pipeline execution
   */
  async runPipeline(
    request: FastifyRequest<{ Body: RunPipelineRequest }>,
    reply: FastifyReply
  ) {
    try {
      // Validate request body
      const body = RunPipelineRequestSchema.parse(request.body);

      // Start trace
      const runId = trace.startPipeline(body.pipeline_mode);
      logger.setRunId(runId);

      logger.info("Pipeline run requested", {
        mode: body.pipeline_mode,
        promptLength: body.prompt.length,
        projectRoot: body.project_root,
        forceReindex: body.force_reindex,
        domainExclusionsCount: body.domainExclusions?.length || 0,
      });

      // Start pipeline execution (async, don't await)
      // Requirements: 1.1, 7.1 - Pass role_configs to PipelineEngine.execute()
      this.executePipelineAsync(
        runId,
        body.pipeline_mode,
        body.prompt,
        body.project_root,
        body.force_reindex || false,
        body.role_configs,
        body.domainExclusions
      );

      // Return immediately with run_id
      return reply.code(200).send({
        ok: true,
        run_id: runId,
        started_at: new Date().toISOString(),
        pipeline_mode: body.pipeline_mode,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * GET /pipeline/status/:run_id
   * Get pipeline execution status
   */
  async getPipelineStatus(
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

    // Determine current step from spans
    const runningSpan = pipelineTrace.spans.find((s) => s.status === "started");
    const currentStep = runningSpan?.name;

    // Map trace status to API status
    // Requirements: 27.7 - Include CANCELLED status
    let status: "pending" | "running" | "completed" | "failed" | "cancelled";
    if (pipelineTrace.status === "running") {
      status = pipelineTrace.spans.length === 0 ? "pending" : "running";
    } else if (pipelineTrace.status === "completed") {
      status = "completed";
    } else if (pipelineTrace.status === "cancelled") {
      status = "cancelled";
    } else {
      status = "failed";
    }
    
    // Get execution state from pipeline engine if available
    const executionState = this.pipelineEngine.getRunState(run_id);

    return reply.code(200).send({
      ok: true,
      run_id,
      status,
      execution_state: executionState,
      current_step: currentStep,
      started_at: pipelineTrace.startTime,
      finished_at: pipelineTrace.endTime,
    });
  }

  /**
   * GET /pipeline/result/:run_id
   * Get pipeline execution result
   */
  async getPipelineResult(
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

    if (pipelineTrace.status !== "completed") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "PIPELINE_NOT_COMPLETED",
          message: `Pipeline is still ${pipelineTrace.status}`,
          run_id,
        },
      });
    }

    // Get result from active runs cache
    const entry = this.activeRuns.get(run_id);

    return reply.code(200).send({
      ok: true,
      run_id,
      status: "completed",
      result: entry?.result || { message: "Result available" },
    });
  }

  /**
   * POST /pipeline/cancel/:run_id
   * Cancel a running pipeline execution
   * 
   * Requirements: 27.7 - Handle cancellation request during execution
   */
  async cancelPipeline(
    request: FastifyRequest<{ Params: { run_id: string } }>,
    reply: FastifyReply
  ) {
    const { run_id } = request.params;

    logger.info("Pipeline cancellation requested", { run_id });

    // Check if pipeline exists
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

    // Check if pipeline is already in terminal state
    if (pipelineTrace.status !== "running") {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "PIPELINE_NOT_RUNNING",
          message: `Pipeline is not running (status: ${pipelineTrace.status})`,
          run_id,
        },
      });
    }

    // Attempt to cancel the pipeline
    const cancelled = this.pipelineEngine.cancel(run_id);

    if (!cancelled) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "CANCELLATION_FAILED",
          message: "Failed to cancel pipeline - it may have already completed or been cancelled",
          run_id,
        },
      });
    }

    logger.info("Pipeline cancellation initiated", { run_id });

    return reply.code(200).send({
      ok: true,
      run_id,
      status: "cancelling",
      message: "Pipeline cancellation has been initiated",
      cancelled_at: new Date().toISOString(),
    });
  }

  /**
   * Execute pipeline asynchronously
   * 
   * Requirements: 1.1, 7.1 - Pass role_configs to PipelineEngine.execute()
   */
  private async executePipelineAsync(
    runId: string,
    mode: string,
    prompt: string,
    projectRoot: string,
    forceReindex: boolean,
    roleConfigs?: RoleConfigsInput,
    domainExclusions?: DomainExclusion[]
  ) {
    try {
      const spanId = trace.startSpan(runId, "pipeline_execution");

      // Requirements: 1.1, 7.1 - Pass role_configs directly to PipelineEngine
      const result = await this.pipelineEngine.execute(
        mode as any,
        prompt,
        this.config,
        projectRoot,
        forceReindex,
        roleConfigs,
        domainExclusions
      );

      // Store result with completion timestamp for TTL-based cleanup
      // Requirements: 13.2 - Schedule cleanup after 1 hour
      this.activeRuns.set(runId, {
        result,
        completedAt: Date.now(),
      });

      // Determine trace status based on result
      const traceStatus = result.success 
        ? "completed" 
        : result.error?.code === "PIPELINE_CANCELLED" 
          ? "cancelled" 
          : "failed";

      trace.endSpan(runId, spanId, traceStatus === 'cancelled' ? 'failed' : traceStatus as 'completed' | 'failed');
      trace.endPipeline(runId, traceStatus === 'cancelled' ? 'failed' : traceStatus as 'completed' | 'failed');

      logger.info("Pipeline execution completed", {
        success: result.success,
        cancelled: result.error?.code === "PIPELINE_CANCELLED",
      });
    } catch (error) {
      const err = error as Error;
      logger.error("Pipeline execution failed", {
        error: err.message,
        stack: err.stack,
      });
      trace.endPipeline(runId, "failed");
    } finally {
      logger.clearRunId();
    }
  }
}
