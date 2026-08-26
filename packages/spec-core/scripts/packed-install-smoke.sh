#!/bin/sh
# Packed-install smoke (PROD-001, TEST-002 smoke half): prove the REAL
# tarball — built, packed, and installed exactly the way a consumer does it
# — yields bins that run as POSIX executables. No `node script.js` shims:
# both bins are invoked by path, relying on the shebang + exec bit the
# package now ships. Deliberately NOT --ignore-scripts: normal lifecycle.
#
# Phases:
#   1. build dist/ fresh (tsc + bin-contract build step + schema export)
#   2. npm pack into a temp dir
#   3. npm install the tarball into a fresh throwaway project
#   4. installed `lco init <dir>` — exit 0, scaffolded manifest exists
#      (lco init refuses with exit 2 if <dir>/spec already exists, so the
#      target dir is virgin by construction)
#   4b. installed `lco --help` / `lco --version` (UX-002) — exit 0 each;
#       --help prints usage to stdout, --version prints the INSTALLED
#       package.json's version (never empty, never hardcoded in the bin)
#   5. installed `lco-mcp` — one JSON-RPC initialize line on stdin, exit 0,
#      exactly one JSON-RPC response line on stdout with serverInfo lco-mcp
#      (envelope shape per src/mcp/server.test.ts)
#
# Usage: pnpm --filter ./packages/spec-core smoke:packed   (or: sh scripts/packed-install-smoke.sh)
set -eu

PKG_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/lco-packed-smoke.XXXXXX")
trap 'rm -rf "$WORK"' EXIT INT TERM

# Diagnostics go to STDERR so a redirected stdout (phase 5 captures the MCP
# handshake) stays pure — only the bin's own output lands in the capture.
say() { printf 'smoke: %s\n' "$*" >&2; }
run() { say "\$ $*"; "$@"; }

# --- 1. fresh build ----------------------------------------------------------------
say "== phase 1: build =="
run sh -c "cd '$PKG_DIR' && npm run build" >/dev/null

# --- 2. pack ------------------------------------------------------------------------
say "== phase 2: npm pack =="
PACK_DIR="$WORK/pack"
mkdir -p "$PACK_DIR"
run sh -c "cd '$PKG_DIR' && npm pack --pack-destination '$PACK_DIR'" >/dev/null
TARBALL=$(ls "$PACK_DIR"/*.tgz)
say "tarball: $TARBALL"

# --- 3. install into a fresh project -------------------------------------------------
say "== phase 3: install tarball into a fresh temp project =="
PROJ="$WORK/proj"
mkdir -p "$PROJ"
printf '{"name":"lco-smoke-project","version":"0.0.0","private":true}\n' > "$PROJ/package.json"
run sh -c "cd '$PROJ' && npm install --no-audit --no-fund --loglevel=error '$TARBALL'" >/dev/null

LCO="$PROJ/node_modules/.bin/lco"
LCO_MCP="$PROJ/node_modules/.bin/lco-mcp"
for bin in "$LCO" "$LCO_MCP"; do
  if [ ! -x "$bin" ]; then
    say "FAIL: installed bin is not executable: $bin"
    exit 1
  fi
done
say "installed bins are executable: $LCO, $LCO_MCP"

# The INSTALLED files (not the repo's dist/) carry the node shebang on line 1.
for rel in lco-spec/dist/cli/index.js lco-spec/dist/mcp/server.js; do
  installed="$PROJ/node_modules/$rel"
  first=$(head -n 1 "$installed")
  if [ "$first" != "#!/usr/bin/env node" ]; then
    say "FAIL: $installed line 1 is '$first', expected '#!/usr/bin/env node'"
    exit 1
  fi
done
say "installed dist files carry the node shebang on line 1"

# --- 4. installed `lco init` as a real executable -------------------------------------
say "== phase 4: lco init (real POSIX exec, no node <script> shim) =="
SPEC_PROJECT="$PROJ/spec-project"
run "$LCO" init "$SPEC_PROJECT"
if [ ! -f "$SPEC_PROJECT/spec/manifest.json" ]; then
  say "FAIL: $SPEC_PROJECT/spec/manifest.json was not created"
  exit 1
fi
say "lco init exit 0, manifest scaffolded at $SPEC_PROJECT/spec/manifest.json"

# --- 4b. installed `lco --help` / `lco --version` (UX-002) ----------------------------
say "== phase 4b: lco --help / lco --version (UX-002) =="
if ! HELP_OUT=$("$LCO" --help); then
  say "FAIL: lco --help exited non-zero"
  exit 1
fi
case "$HELP_OUT" in
  usage:*) ;;
  *) say "FAIL: lco --help output does not start with 'usage:'" ; exit 1 ;;
esac
if ! VERSION_OUT=$("$LCO" --version); then
  say "FAIL: lco --version exited non-zero"
  exit 1
fi
if [ -z "$VERSION_OUT" ]; then
  say "FAIL: lco --version printed an empty version"
  exit 1
fi
EXPECTED_VERSION=$(node -e 'console.log(require(process.argv[1] + "/node_modules/lco-spec/package.json").version)' "$PROJ")
if [ "$VERSION_OUT" != "$EXPECTED_VERSION" ]; then
  say "FAIL: lco --version printed '$VERSION_OUT' but installed package.json says '$EXPECTED_VERSION'"
  exit 1
fi
say "lco --help ok (usage on stdout); lco --version ok: $VERSION_OUT (matches installed package.json)"

# --- 5. installed `lco-mcp` initialize handshake ---------------------------------------
say "== phase 5: lco-mcp initialize handshake over stdio =="
MCP_OUT="$WORK/mcp-initialize.out"
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | run "$LCO_MCP" > "$MCP_OUT"
# The server must exit 0 on stdin EOF (set -e already aborts otherwise) and
# answer with exactly one parseable JSON-RPC response carrying our serverInfo.
node -e '
const lines = require("node:fs")
  .readFileSync(process.argv[1], "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "");
if (lines.length !== 1) {
  console.error("smoke: expected exactly 1 JSON-RPC response line, got " + lines.length + ": " + lines.join(" | "));
  process.exit(1);
}
const res = JSON.parse(lines[0]);
if (res.id !== 1 || res.jsonrpc !== "2.0" || !res.result || res.result.serverInfo?.name !== "lco-mcp") {
  console.error("smoke: bad initialize response: " + lines[0]);
  process.exit(1);
}
console.log("smoke: initialize response ok: serverInfo=" + JSON.stringify(res.result.serverInfo));
' "$MCP_OUT"

say "PASS — packed-install smoke: pack -> install -> lco init -> lco-mcp handshake all green"
