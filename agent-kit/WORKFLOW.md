# FolderRocket Full_stack_pack runtime map

This file maps the user-requested Full_stack_pack roles to the project files for each runtime. `AGENTS.md` is authoritative for project constraints. FolderRocket's [Codex coordination guide](../.codex/agents/README.md) owns routing, permissions, and review rules; the [local skill catalog](../.agents/skills/README.md) owns skill selection.

## Roles

| Pack role | Existing Codex ID and file | Claude Code ID and file | Cursor ID and file |
|---|---|---|---|
| `prompt-agent` | `prompt_agent` — [prompt_agent.toml](../.codex/agents/prompt_agent.toml) | `prompt-agent` — [prompt-agent.md](../.claude/agents/prompt-agent.md) | `prompt-agent` — [prompt-agent.md](../.cursor/agents/prompt-agent.md) |
| `architect` | `architect` — [architect.toml](../.codex/agents/architect.toml) | `architect` — [architect.md](../.claude/agents/architect.md) | `architect` — [architect.md](../.cursor/agents/architect.md) |
| `backend` | `backend` — [backend.toml](../.codex/agents/backend.toml) | `backend` — [backend.md](../.claude/agents/backend.md) | `backend` — [backend.md](../.cursor/agents/backend.md) |
| `frontend` | `frontend` — [frontend.toml](../.codex/agents/frontend.toml) | `frontend` — [frontend.md](../.claude/agents/frontend.md) | `frontend` — [frontend.md](../.cursor/agents/frontend.md) |
| `ai-engineer` | `ai_engineer` — [ai_engineer.toml](../.codex/agents/ai_engineer.toml) | `ai-engineer` — [ai-engineer.md](../.claude/agents/ai-engineer.md) | `ai-engineer` — [ai-engineer.md](../.cursor/agents/ai-engineer.md) |
| `reviewer` | `reviewer` — [reviewer.toml](../.codex/agents/reviewer.toml) | `reviewer` — [reviewer.md](../.claude/agents/reviewer.md) | `reviewer` — [reviewer.md](../.cursor/agents/reviewer.md) |
| FolderRocket-only AppStarter | `app_starter` — [app_starter.toml](../.codex/agents/app_starter.toml) | Not included in this pack | Not included in this pack |

Codex keeps its existing FolderRocket-specific TOMLs. The pack's hyphenated IDs `prompt-agent` and `ai-engineer` are mapped to the existing Codex IDs `prompt_agent` and `ai_engineer`; no duplicate Codex roles were added. Claude Code and Cursor agent files were generated from the Full_stack_pack.

## Skills

The project keeps `.agents/skills` as the source of truth for Codex and Cursor. It contains the fourteen existing FolderRocket skills plus the pack's `folder-structure` skill. `.claude/skills` mirrors all fifteen skill folders, including resources and metadata; the files match byte-for-byte, with the legacy `Handoff` directory named `handoff` to match its skill ID. The pack's Cursor adapter targets both `.agents/skills` and `.claude/skills`; runtime discovery remains unverified in this installation. Keep both trees equivalent when updating a skill. Use the exact skill name in each `SKILL.md` frontmatter.

## Installation and verification status

The stock installer preview against the FolderRocket root stopped at the pre-existing customized `.agents/skills/agent-configuration/SKILL.md`, so its `--apply` was not run against the project. The stock installer was run in an isolated staging project; its `--apply` and `--check` both passed. Only generated Claude/Cursor roles and the missing `folder-structure` skill were integrated into the project; existing Codex role and skill files were preserved. See [INSTALLATION.json](INSTALLATION.json) for source hashes and file status.

Files generated and configuration paths were checked. Claude Code and Cursor were not available on `PATH` during installation; runtime discovery and calls in those applications remain unverified. Codex's customized configuration remains in place; this integration did not re-invoke those roles.
