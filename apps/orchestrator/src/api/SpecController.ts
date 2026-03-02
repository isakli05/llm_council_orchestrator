import { FastifyRequest, FastifyReply } from "fastify";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../observability/Logger";

/**
 * SpecController handles spec file retrieval endpoints
 */
export class SpecController {
  private specRoot: string;

  constructor(specRoot?: string) {
    this.specRoot =
      specRoot || path.join(process.cwd(), "apps/orchestrator/development_specs");
  }

  /**
   * GET /spec/project_context
   * Get project context YAML content
   */
  async getProjectContext(request: FastifyRequest, reply: FastifyReply) {
    try {
      const filename = "orchestrator_project_context.yaml";
      const filePath = path.join(this.specRoot, filename);

      if (!fs.existsSync(filePath)) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "SPEC_NOT_FOUND",
            message: `Spec file not found: ${filename}`,
          },
        });
      }

      const content = fs.readFileSync(filePath, "utf-8");

      logger.info("Project context spec retrieved", { filename });

      return reply.code(200).send({
        ok: true,
        filename,
        content,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * GET /spec/modules
   * Get all module spec YAML contents
   */
  async getModuleSpecs(request: FastifyRequest, reply: FastifyReply) {
    try {
      if (!fs.existsSync(this.specRoot)) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: "SPEC_NOT_FOUND",
            message: `Spec directory not found: ${this.specRoot}`,
          },
        });
      }

      // Read all orchestrator_*_module.yaml files
      const files = fs.readdirSync(this.specRoot);
      const moduleFiles = files.filter(
        (f) => f.startsWith("orchestrator_") && f.endsWith("_module.yaml")
      );

      const modules = moduleFiles.map((filename) => {
        const filePath = path.join(this.specRoot, filename);
        const content = fs.readFileSync(filePath, "utf-8");
        const name = filename.replace("orchestrator_", "").replace("_module.yaml", "");

        return {
          name,
          filename,
          content,
        };
      });

      logger.info("Module specs retrieved", { count: modules.length });

      return reply.code(200).send({
        ok: true,
        modules,
      });
    } catch (error) {
      throw error;
    }
  }
}
