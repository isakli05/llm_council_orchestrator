#!/usr/bin/env python3
"""Check or intentionally refresh Graphify source metadata for the ZCode adapter."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ASSETS = (
    "always_on/agents-md.md",
    "skill-codex.md",
    "skills/codex/references/query.md",
    "skills/codex/references/update.md",
)
REQUIRED_COMMANDS = ("query", "explain", "path", "update", "check-update")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def observed_graphify() -> dict[str, object]:
    executable = shutil.which("graphify")
    if not executable:
        raise SystemExit("graphify executable is not on PATH")
    first_line = Path(executable).read_text(encoding="utf-8").splitlines()[0]
    if not first_line.startswith("#!"):
        raise SystemExit("cannot resolve Graphify's isolated Python interpreter")
    interpreter = first_line[2:].strip()
    probe = subprocess.run(
        [interpreter, "-c", "import json, pathlib, graphify; from importlib.metadata import version; print(json.dumps({'root': str(pathlib.Path(graphify.__file__).resolve().parent), 'version': version('graphifyy')}))"],
        capture_output=True,
        text=True,
        check=True,
    )
    package_info = json.loads(probe.stdout)
    package_root = Path(package_info["root"])
    help_result = subprocess.run([executable, "--help"], capture_output=True, text=True, check=True)
    missing = [name for name in REQUIRED_COMMANDS if name not in help_result.stdout]
    if missing:
        raise SystemExit(f"installed Graphify lacks required commands: {', '.join(missing)}")
    guard_result = subprocess.run(
        [executable, "hook-guard", "read"], input="{}\n", capture_output=True, text=True
    )
    if guard_result.returncode != 0:
        raise SystemExit("installed Graphify hook-guard compatibility command failed")
    return {
        "package": "graphifyy",
        "version": package_info["version"],
        "upstream_repository": "https://github.com/Graphify-Labs/graphify",
        "assets": {relative: sha256(package_root / relative) for relative in ASSETS},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Graphify asset drift without overwriting ZCode policy.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="check for source-asset drift (default)")
    mode.add_argument("--write", action="store_true", help="accept metadata after adapter review")
    parser.add_argument("--upstream-commit", help="audited Graphify upstream commit; required with --write")
    args = parser.parse_args()

    metadata_path = Path(__file__).resolve().parent.parent / "references" / "graphify-source.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    observed = observed_graphify()
    recorded = metadata.get("graphify", {})
    comparable_recorded = {
        key: recorded.get(key) for key in ("package", "version", "upstream_repository", "assets")
    }
    if comparable_recorded == observed:
        print(f"Graphify source metadata is current ({observed['version']}).")
        return 0
    if not args.write:
        print("Graphify source assets changed; review the ZCode adapter before accepting:")
        print(json.dumps({"recorded": comparable_recorded, "observed": observed}, indent=2))
        return 1
    if not args.upstream_commit:
        print("--write requires --upstream-commit from the audited Graphify release")
        return 2
    metadata["graphify"] = {**observed, "upstream_commit": args.upstream_commit}
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"Accepted Graphify source metadata for {observed['version']}; SKILL.md was not modified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
