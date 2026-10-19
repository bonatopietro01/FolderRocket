# FolderRocket Codex routing hooks

The project-local `.codex/hooks.json` registers a small Node script for `SessionStart`, `UserPromptSubmit`, and `SubagentStart`. It reads the current hook JSON from stdin, emits bounded `additionalContext` only for recognized skill or role triggers, and does not store prompts, read user documents, access the network, or start agents.

The canonical project skill source is `.agents/skills`. Codex can discover those skills, but discovery does not dispatch the configured roles. The coordinator still explicitly selects skills and starts agents with the available agent tooling. The hook reinforces that boundary: each configured SubagentStart carries the mandatory skill-activation reminder, and Prompt Agent always gets writing-for-agents plus grilling and a pre-READY decision-frontier check. UserPromptSubmit recognizes direct Italian requests such as "fammi il prompt", "fammi un prompt", "fai prompt per..." and "puoi farmi un prompt". Quoted examples, negations and routing reports are not prompt-writing requests. This lexical helper is deliberately bounded; the coordinator reads the full request and routes genuine prompt intent even if its wording is not matched. Hooks emit context and cannot read/apply skills or launch agents on the role’s behalf.

Project hooks are subject to Codex's normal project trust and per-definition review. Before the runtime may execute them, inspect the definitions in Codex's `/hooks` interface and trust them there. A changed hook definition requires review again. Do not bypass hook trust. This checkout has only synthetic command-line fixture evidence until a user-reviewed fresh Codex session demonstrates the native events.

Run the local synthetic routing and compatibility checks with:

```powershell
node --test tests/codexSkillHooks.test.mjs
```
