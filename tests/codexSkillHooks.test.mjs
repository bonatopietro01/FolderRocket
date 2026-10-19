import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hookPath = path.join(repoRoot, ".codex", "hooks", "route.mjs");
const hookConfigPath = path.join(repoRoot, ".codex", "hooks.json");
const skillsRoot = path.join(repoRoot, ".agents", "skills");

test("canonical skill tree has fourteen readable skills and legacy pointer", () => {
  const skillDirectories = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  assert.equal(skillDirectories.length, 14);
  assert.ok(skillDirectories.includes("Handoff"));
  assert.ok(skillDirectories.includes("grilling"));
  for (const directory of skillDirectories) {
    assert.ok(existsSync(path.join(skillsRoot, directory, "SKILL.md")), `${directory} has a SKILL.md`);
    assert.ok(existsSync(path.join(skillsRoot, directory, "agents", "openai.yaml")), `${directory} has metadata`);
  }
  assert.match(readFileSync(path.join(repoRoot, ".codex", "skills", "README.md"), "utf8"), /\.\.\/\.\.\/\.agents\/skills\/README\.md/);
});

function runHook(input) {
  const result = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
    cwd: repoRoot,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return result.stdout.trim();
}

function hookContext(output) {
  if (!output) return "";
  const parsed = JSON.parse(output);
  return parsed.hookSpecificOutput.additionalContext;
}

test("session start points to canonical skills and coordinator-owned dispatch", () => {
  const context = hookContext(runHook({ hook_event_name: "SessionStart", source: "startup" }));

  assert.match(context, /\.agents\/skills\/README\.md/);
  assert.match(context, /do not dispatch agents/i);
  assert.match(context, /preserve R IDs/i);
});

test("prompt-writing request routes to Prompt Agent without executing its described task", () => {
  const context = hookContext(
    runHook({
      hook_event_name: "UserPromptSubmit",
      prompt: "Fammi il prompt per aggiornare il Planet Graph",
    }),
  );

  assert.match(context, /Prompt Agent/);
  assert.match(context, /writing-for-agents\/SKILL\.md/);
  assert.match(context, /grilling\/SKILL\.md/);
  assert.match(context, /decision frontier/);
  assert.match(context, /do not execute the task described/i);
});

for (const prompt of [
  "Fammi un prompt per TreeRocket",
  "Fammi prompt per ordinare i menu",
  "Fai il prompt per la Dashboard",
  "Fai un prompt per Gmail",
  "fai prompt per: correggere Rename",
  "Puoi farmi un prompt per il grafo?",
  "Potresti creare un prompt per i pianeti?",
  "Mi fai il prompt per il layout?",
  "Per favore, scrivi un prompt per la ricerca",
  "Ciao, migliora questo prompt",
  "Rivedi questo prompt",
  "Riscrivimi il prompt",
  "Preparami un prompt",
  "Vorrei un prompt per il filtro",
  "Mi serve un prompt",
  "Can you write a prompt for the folder view?",
  "Rewrite the prompt",
  "Chiama il Prompt Agent per preparare il testo",
]) {
  test(`direct prompt request routes with both mandatory procedures: ${prompt}`, () => {
    const context = hookContext(runHook({ hook_event_name: "UserPromptSubmit", prompt }));
    assert.match(context, /coordinator must call Prompt Agent/);
    assert.match(context, /writing-for-agents\/SKILL\.md/);
    assert.match(context, /grilling\/SKILL\.md/);
    assert.match(context, /skill_usage/);
  });
}

for (const prompt of [
  "Ho il prompt per gli agenti che non viene richiamato se scrivo fammi il prompt",
  "Perché quando scrivo fammi il prompt non viene chiamato il ruolo?",
  '"Fammi un prompt" è un esempio da inserire nella documentazione',
  "`fai prompt per...` è la frase da riconoscere",
  "Non creare un prompt, controlla soltanto la configurazione",
  "Non voglio un prompt",
  "Il Prompt Agent non viene chiamato",
  "Controlla il routing della frase fai prompt per...",
]) {
  test(`routing report, quotation or negation does not request a new prompt: ${prompt}`, () => {
    assert.equal(runHook({ hook_event_name: "UserPromptSubmit", prompt }), "");
  });
}

test("explicit grilling request points at its skill file", () => {
  const context = hookContext(
    runHook({ hook_event_name: "UserPromptSubmit", prompt: "Usa la skill grilling per questo piano" }),
  );

  assert.match(context, /\.agents\/skills\/grilling\/SKILL\.md/);
});

test("natural handoff request is routed to the case-preserving Handoff skill", () => {
  const context = hookContext(
    runHook({ hook_event_name: "UserPromptSubmit", prompt: "Prepara un passaggio a una nuova chat" }),
  );

  assert.match(context, /\.agents\/skills\/Handoff\/SKILL\.md/);
});

test("explicit handoff mention resolves once to the canonical case-sensitive directory", () => {
  const context = hookContext(runHook({ hook_event_name: "UserPromptSubmit", prompt: "Usa la skill handoff" }));

  assert.equal((context.match(/\.agents\/skills\/Handoff\/SKILL\.md/g) ?? []).length, 1);
  assert.doesNotMatch(context, /\.agents\/skills\/handoff\/SKILL\.md/);
});

test("unrelated prompt receives no routing context", () => {
  const output = runHook({ hook_event_name: "UserPromptSubmit", prompt: "Quanto fa 2 + 2?" });

  assert.equal(output, "");
});

test("configured role gets a bounded reminder while an unknown role is ignored", () => {
  const known = hookContext(runHook({ hook_event_name: "SubagentStart", agent_type: "backend" }));
  const unknown = runHook({ hook_event_name: "SubagentStart", agent_type: "unconfigured_role" });

  assert.match(known, /assigned server, persistence, filesystem/);
  assert.equal(unknown, "");
});

for (const role of ["app_starter", "architect", "backend", "frontend", "ai_engineer", "reviewer", "prompt_agent"]) {
  test(`role invocation requires skill reads before work: ${role}`, () => {
    const context = hookContext(runHook({ hook_event_name: "SubagentStart", agent_type: role }));
    assert.match(context, /Before work read \.agents\/skills\/README\.md/);
    assert.match(context, /without waiting for skill names/);
    assert.match(context, /read\/apply their SKILL\.md/);
    assert.match(context, /skill_usage/);
    assert.ok(context.length <= 500, `${role} reminder fits the configured context limit`);
    if (role === "prompt_agent") {
      assert.match(context, /writing-for-agents\/SKILL\.md/);
      assert.match(context, /grilling\/SKILL\.md/);
      assert.match(context, /Before READY/);
    }
  });
}

test("project hook config uses only the three intended events and never bypasses trust", () => {
  const config = JSON.parse(readFileSync(hookConfigPath, "utf8"));
  const configuredEvents = Object.keys(config.hooks).sort();

  assert.deepEqual(configuredEvents, ["SessionStart", "SubagentStart", "UserPromptSubmit"]);
  const handlers = Object.values(config.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks));
  assert.equal(handlers.length, 3);
  assert.ok(handlers.every((handler) => handler.type === "command"));
  assert.ok(handlers.every((handler) => handler.command.includes(".codex/hooks/route.mjs")));
  assert.ok(handlers.every((handler) => handler.timeout <= 5));
  assert.doesNotMatch(JSON.stringify(config), /dangerously-bypass-hook-trust|bypass-hook-trust/i);
  assert.ok(readFileSync(hookPath, "utf8").length > 0);
});
