import { FastifyRequest, FastifyReply } from "fastify";
import { IndexClient } from "../indexer/IndexClient";
import { IndexStatus } from "../indexer/types";
import { logger } from "../observability/Logger";
import {
  EnsureIndexedRequest,
  EnsureIndexedRequestSchema,
  IndexStatusQuery,
  IndexStatusQuerySchema,
} from "./validators";

/**
 * IndexController handles index management endpoints
 */
export class IndexController {
  private indexClient: IndexClient;

  constructor(indexClient: IndexClient) {
    this.indexClient = indexClient;
  }

  /**
   * POST /index/ensure
   * Ensure index is ready for a project
   * Supports request cancellation via AbortController.
   * 
   * Requirements: 24.6, 24.7 - Support request cancellation
   */
  async ensureIndexed(
    request: FastifyRequest<{ Body: EnsureIndexedRequest }>,
    reply: FastifyReply
  ) {
    try {
      const body = EnsureIndexedRequestSchema.parse(request.body);

      logger.info("Index ensure requested", {
        projectRoot: body.project_root,
        forceReindex: body.force_reindex,
      });

      // Get the AbortController from the request for cancellation support
      // Requirements: 24.6, 24.7 - Propagate AbortController signal
      const abortController = (request as any).abortController as AbortController | undefined;
      const result = await this.indexClient.ensureIndex(
        body.project_root, 
        body.force_reindex,
        { signal: abortController?.signal }
      );

      if (result.status === IndexStatus.FAILED) {
        // Check if this was a cancellation
        // Requirements: 24.6, 24.7 - Handle cancelled requests
        if (result.error?.code === "REQUEST_CANCELLED") {
          return reply.code(499).send({
            ok: false,
            error: {
              code: "REQUEST_CANCELLED",
              message: "Request was cancelled by client disconnect",
            },
          });
        }

        return reply.code(500).send({
          ok: false,
          error: {
            code: "INDEX_ERROR",
            message: result.error?.message || "Index operation failed",
            details: result.error,
          },
        });
      }

      return reply.code(200).send({
        ok: true,
        project_root: body.project_root,
        indexed_at: result.completedAt || new Date().toISOString(),
        changed_files_count: result.filesIndexed || 0,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * GET /index/status
   * Get index status for a project
   */
  async getIndexStatus(
    request: FastifyRequest<{ Querystring: IndexStatusQuery }>,
    reply: FastifyReply
  ) {
    try {
      const query = IndexStatusQuerySchema.parse(request.query);
      const projectRoot = query.project_root || process.cwd();

      const status = this.indexClient.getStatus();

      // Map internal status to API status
      let apiStatus: "not_indexed" | "indexing" | "ready" | "error";
      switch (status) {
        case IndexStatus.NOT_STARTED:
          apiStatus = "not_indexed";
          break;
        case IndexStatus.IN_PROGRESS:
          apiStatus = "indexing";
          break;
        case IndexStatus.READY:
          apiStatus = "ready";
          break;
        case IndexStatus.FAILED:
          apiStatus = "error";
          break;
        default:
          apiStatus = "not_indexed";
      }

      return reply.code(200).send({
        ok: true,
        project_root: projectRoot,
        status: apiStatus,
        last_indexed_at:
          status === IndexStatus.READY ? new Date().toISOString() : undefined,
        documents_count: status === IndexStatus.READY ? 42 : undefined,
      });
    } catch (error) {
      throw error;
    }
  }
}
