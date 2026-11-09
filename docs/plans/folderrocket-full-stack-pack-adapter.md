# Add Claude Code and Cursor adapters for FolderRocket

This ExecPlan follows `PLANS.md`. It is a living document; progress, findings, decisions, and outcomes are updated as the integration proceeds.

## Purpose / Big Picture

Install the user-requested Full_stack_pack in a way that adds Claude Code and Cursor project agents while preserving FolderRocket's customized Codex agents and local skills. The current Codex skill tree remains the shared source; `.claude/skills` mirrors each file byte-for-byte, with the legacy `Handoff` directory normalized to the skill ID `handoff`. The pack's missing `folder-structure` skill is added to both.

## Progress

- [x] (2026-11-09 20:01Z) Read project and pack instructions, inspect the clean baseline, and run the pack's read-only preview.
- [x] (2026-11-09) Generate Claude Code and Cursor agent files in the isolated staging project; staged apply and check passed.
- [x] (2026-11-09) Add `folder-structure`, mirror the local skills to Claude Code, and document runtime IDs and provenance.
- [x] (2026-11-09) Validate preservation, paths, names, skill-copy equivalence, hashes and repository diff.
- [x] (2026-11-09) Complete the required read-only review and one focused re-review after correcting the stale skill count.

## Requirement Traceability

| ID | Acceptance criterion | Owner | Status / evidence |
|---|---|---|---|
| R1 | Existing Codex role TOMLs and existing skill procedures remain unchanged. | Coordinator | PASS: 39 tracked TOML/skill files match the clean baseline after line-ending normalization. |
| R2 | Six pack roles are present for Claude Code and Cursor, with IDs and paths mapped accurately. | Coordinator | PASS: six Claude and six Cursor files; frontmatter IDs and documented path aliases checked. Runtime calls remain unverified. |
| R3 | The missing `folder-structure` skill is added; the Claude skill mirror matches the canonical skills. | Coordinator | PASS: 15 skill folders and 33 files mirrored with matching file hashes; legacy `Handoff` path mapped to `handoff`. |
| R4 | Root instructions, workflow map and installation manifest document aliases, provenance and runtime limits. | Coordinator | PASS: 52 manifest entries/hashes checked, local links resolve, JSON parses, and runtime status remains NOT_VERIFIED. |
| R5 | Static verification and read-only Reviewer review complete without changing unrelated working-tree state. | Coordinator / Reviewer | PASS: focused re-review approved; `git diff --check` passed. The generated staging directory remains because automatic review rejected recursive removal of its reparse-point path. |

## Surprises & Discoveries

- The stock preview stops at `.agents/skills/agent-configuration/SKILL.md`, an existing FolderRocket adaptation without a prior pack manifest. The pack installer correctly refuses to replace this unowned customization.
- FolderRocket already has seven Codex TOMLs and fourteen local skills. Codex IDs `prompt_agent` and `ai_engineer` differ from this pack's `prompt-agent` and `ai-engineer`; direct application could create duplicate roles.
- Neither `claude` nor `cursor` is available on `PATH`; generated files can be checked statically, while runtime recognition and calls remain unverified.

## Decision Log

- Preserve all existing `.codex/agents/*.toml` and `.agents/skills/**` files. Add only the pack's missing `folder-structure` skill and the absent Claude/Cursor project agent files.
- Mirror the resulting local skill set from `.agents/skills` into `.claude/skills`, normalizing the `Handoff` directory to the skill's `handoff` name. This keeps instructions and resources equivalent across runtimes.
- Generate Claude/Cursor agent files using the pack installer in a temporary clean project, then selectively integrate those generated outputs. Do not run the stock installer with `--apply` against FolderRocket because its expected canonical copies conflict with existing adaptations.
- Record generated hashes and runtime status in `agent-kit/INSTALLATION.json`; use a FolderRocket-specific workflow map for the existing Codex aliases.

## Outcomes & Retrospective

Implementation and static checks are complete. The first read-only review found one stale skill count in `.codex/agents/README.md`; it was corrected from 14 to 15 and added to the manifest. The focused re-review approved the fix. Existing Codex role TOMLs and skill files match the baseline; generated role files and skill mirrors pass the static checks. Claude/Cursor runtime recognition remains unverified.

## Context and Orientation

The destination is the FolderRocket repository root. Before this task it was clean on `main` at `216963c`. `.codex/agents/README.md`, `.agents/skills/README.md`, and `AGENTS.md` define the active FolderRocket routing and skill policy. The external Full_stack_pack supplies six portable roles (`prompt-agent`, `architect`, `backend`, `frontend`, `ai-engineer`, `reviewer`) and twelve skills, including `folder-structure`.

The destination already has custom Codex roles (`app_starter`, `architect`, `backend`, `frontend`, `ai_engineer`, `reviewer`, `prompt_agent`) and fourteen skill directories. The initial stock preview was read-only and stopped on the existing `agent-configuration` skill conflict; no project files were written by that preview.

## Plan of Work

First run the stock generator against a uniquely named temporary project. The command sandbox isolates `%TEMP%` between tool calls, so use a confirmed-absent staging directory at `agent-kit/.full-stack-stage` inside the workspace. Use its generated `.claude/agents` and `.cursor/agents` files, not its replacement Codex or skill outputs. The stage remains after automatic review rejected its recursive removal because the path is a reparse point; no alternate deletion was attempted.

Next copy the missing `folder-structure` skill into `.agents/skills`, update the local skill catalog, and mirror every `.agents/skills/<name>` directory into `.claude/skills/<name>`. Preserve all existing skill contents. Add concise root instructions and a workflow mapping from the pack's hyphenated IDs to FolderRocket's existing Codex underscore IDs. Record hashes and separate generated-file status from unverified Claude/Cursor runtime behavior.

## Concrete Steps

From the repository root, using the verified Python 3.14 interpreter and the user-provided pack path:

    python <pack>/Skills/agent-configuration/scripts/install_agent_pack.py --pack <pack> --project <temporary-stage> --apply
    python <pack>/Skills/agent-configuration/scripts/install_agent_pack.py --pack <pack> --project <temporary-stage> --check

The first command should create the source pack's complete output in staging; the second should report `CHECK OK`. Integrate only the generated Claude/Cursor roles and the missing skill, then run targeted PowerShell/Python checks for role IDs, links, skill tree equivalence, and manifest hashes. Do not run FolderRocket app tests, builds, lint, or runtime checks for this configuration-only task.

## Validation and Acceptance

- All existing Codex role TOMLs and the original fourteen `.agents/skills` directories remain byte-for-byte unchanged.
- Six Claude agent files and six Cursor agent files exist with the IDs from `pack.json`; each local link resolves.
- `.agents/skills` contains the original fourteen skills plus `folder-structure`; `.claude/skills` contains equivalent per-skill files and bytes.
- `agent-kit/WORKFLOW.md` maps `prompt-agent` to `prompt_agent` and `ai-engineer` to `ai_engineer` for Codex and does not imply that the source pack's Codex TOMLs were installed.
- `agent-kit/INSTALLATION.json` records source hashes, generated files, preserved local files, and `NOT_VERIFIED` Claude/Cursor runtime status.
- `git diff --check` passes and no unrelated source, personal data, or credentials are changed.

## Idempotence and Recovery

The project changes are additive except for small documentation/catalog updates. Never delete or replace the existing Codex role or skill files. If staging or integration fails, preserve the generated evidence and stop before cleanup unless the exact staging path is verified as `agent-kit/.full-stack-stage`. A repeated run must compare all target files against the manifest and report edits rather than silently overwrite them.

## Artifacts and Notes

The exact stock preview conflict and the clean baseline are recorded in this plan. The manifest records source and installed-file SHA-256 values without embedding local absolute paths.

The generated staging path `agent-kit/.full-stack-stage` remains in the workspace. Automatic review rejected its recursive removal because the path is a reparse point; no alternate deletion was attempted.

## Interfaces and Dependencies

No FolderRocket application APIs or runtime code change. The integration depends on the user-provided pack's `install_agent_pack.py`, its `pack.json`, the existing FolderRocket agent/skill tree, and Python 3.11+.

## Revision Notes

- 2026-11-09: Initial plan after the stock installer preview identified protected FolderRocket customizations; use a preserving multi-runtime adapter.
- 2026-11-09: Keep staging in a confirmed-absent workspace directory because tool sandboxes isolate `%TEMP%` between calls.
- 2026-11-09: Updated the stale skill count found in first review; rerun manifest and diff checks, then perform one focused re-review.
- 2026-11-09: Reviewer approved the focused re-review; the generated staging path remains because automatic review blocked recursive removal of its reparse-point directory.
