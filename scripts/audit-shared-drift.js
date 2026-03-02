#!/usr/bin/env node
/**
 * Shared Drift Audit Script
 *
 * Scans /apps for:
 *  - Shared type drift
 *  - Shared config / policy drift
 *  - Shared utility duplication
 *
 * Outputs human-readable reports under .audit/
 *
 * NO automatic refactors are performed.
 */

import fs from "fs";
import path from "path";
import readline from "readline";

const ROOT = process.cwd();
const APPS_DIR = path.join(ROOT, "apps");
const AUDIT_DIR = path.join(ROOT, ".audit");

const TYPE_REGEX = /^\s*(export\s+)?(interface|type|enum)\s+(\w+)/;
const CONFIG_REGEX =
  /\b(general_architecture|DEEP|EXCLUDED|PIPELINE_MODES|analysisDepth)\b/;
const UTIL_REGEX =
  /\b(function|const)\s+(validate|assert|safe|normalize|hash)\w*/;

function ensureAuditDir() {
  if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR);
  }
}

function walk(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, cb);
    } else if (entry.isFile() && full.endsWith(".ts")) {
      cb(full);
    }
  }
}

async function scanFile(file, collectors) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });

  let lineNo = 0;

  for await (const line of rl) {
    lineNo++;

    const typeMatch = line.match(TYPE_REGEX);
    if (typeMatch) {
      collectors.types.push({
        name: typeMatch[3],
        file,
        line: lineNo,
      });
    }

    if (CONFIG_REGEX.test(line)) {
      collectors.config.push({
        value: line.trim(),
        file,
        line: lineNo,
      });
    }

    const utilMatch = line.match(UTIL_REGEX);
    if (utilMatch) {
      collectors.utils.push({
        name: utilMatch[2],
        file,
        line: lineNo,
      });
    }
  }
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    acc[item[key]] ||= [];
    acc[item[key]].push(item);
    return acc;
  }, {});
}

function writeReport(name, content) {
  fs.writeFileSync(path.join(AUDIT_DIR, name), content);
}

function formatCandidates(title, groups, reason) {
  let out = `# ${title}\n\n`;

  for (const [name, items] of Object.entries(groups)) {
    if (items.length < 2) continue;

    out += `## Candidate: ${name}\n\n`;
    out += `Reason:\n- ${reason}\n\nFound in:\n`;
    for (const i of items) {
      out += `- ${i.file}:${i.line}\n`;
    }
    out += `\nRecommended action:\n➡ Move to packages/${title
      .toLowerCase()
      .replace(" ", "-")}\n\n`;
  }

  return out;
}

async function main() {
  ensureAuditDir();

  const collectors = {
    types: [],
    config: [],
    utils: [],
  };

  walk(APPS_DIR, (file) => scanFile(file, collectors));

  const typeGroups = groupBy(collectors.types, "name");
  const configGroups = groupBy(collectors.config, "value");
  const utilGroups = groupBy(collectors.utils, "name");

  writeReport(
    "shared-types.candidates.md",
    formatCandidates(
      "Shared Types",
      typeGroups,
      "Same type name defined in multiple app-level locations"
    )
  );

  writeReport(
    "shared-config.candidates.md",
    formatCandidates(
      "Shared Config",
      configGroups,
      "Same policy / magic value used in multiple locations"
    )
  );

  writeReport(
    "shared-utils.candidates.md",
    formatCandidates(
      "Shared Utils",
      utilGroups,
      "Helper-style function duplicated across services"
    )
  );

  const summary = `
# Audit Summary

Types found: ${collectors.types.length}
Config usages found: ${collectors.config.length}
Utils found: ${collectors.utils.length}

Reports generated:
- shared-types.candidates.md
- shared-config.candidates.md
- shared-utils.candidates.md

⚠ This audit performs NO automatic refactors.
⚠ Review candidates manually before moving code.
`;

  writeReport("summary.md", summary.trim());

  console.log("✅ Shared drift audit complete. See .audit/ directory.");
}

main().catch((err) => {
  console.error("❌ Audit failed:", err);
  process.exit(1);
});

