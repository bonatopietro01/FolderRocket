const MAX_INPUT_BYTES = 64 * 1024;

const skillActivationHint = "Before work read .agents/skills/README.md, select matching procedures without waiting for skill names, read/apply their SKILL.md files within your permissions, and return actual skill_usage with paths and reasons.";

const roleHints = {
  app_starter:
    "You are AppStarter: keep application mapping read-only, preserve existing data, and return a bounded structure or organization plan.",
  architect:
    "You are Architect: define cross-boundary contracts and risks in read-only mode; do not implement files.",
  backend:
    "You are Backend: stay within assigned server, persistence, filesystem, integration, or Electron files; preserve local-only and scope boundaries.",
  frontend:
    "You are Frontend: stay within assigned React/TypeScript UI and client state; preserve existing navigation and verify claims against source or rendered evidence.",
  ai_engineer:
    "You are AIEngineer: stay within assigned prompt, extraction, retrieval, and AI-context behavior; do not add remote calls to local workflows.",
  reviewer:
    "You are Reviewer: perform a strict read-only review of the actual diff and report concrete findings with evidence; do not edit files.",
  prompt_agent:
    "Prompt Agent is read-only. Before READY read/apply .agents/skills/writing-for-agents/SKILL.md and .agents/skills/grilling/SKILL.md; report the decision frontier. Ask only open material decisions; prepare the prompt only.",
};

const skillRules = [
  { name: "grilling", pattern: /\bgrilling\b|\bgrill(?:ing)? this\b|\bgriglia(?:re)?\b/i },
  { name: "handoff", pattern: /\bhandoff\b|\bpassaggio\b.{0,40}\b(chat|agente|task)\b|\bprepara\b.{0,30}\bcontinuazione\b/i },
  { name: "retro", pattern: /\bretro(?:spettiva)?\b|\bretrospective\b/i },
  { name: "pipeline-benchmark", pattern: /\bpipeline[- ]benchmark\b|\bbenchmark\b.{0,30}\bagent/i },
  { name: "investigate-first", pattern: /\binvestigate[- ]first\b/i },
  { name: "diagnosing-bugs", pattern: /\bdiagnosing[- ]bugs\b/i },
  { name: "requirement-traceability", pattern: /\brequirement[- ]traceability\b/i },
  { name: "project-graph-context", pattern: /\bproject[- ]graph[- ]context\b/i },
  { name: "safe-refactor", pattern: /\bsafe[- ]refactor\b/i },
  { name: "surgical-patch", pattern: /\bsurgical[- ]patch\b/i },
  { name: "verify-and-stop", pattern: /\bverify[- ]and[- ]stop\b/i },
  { name: "agent-configuration", pattern: /\bagent[- ]configuration\b/i },
  { name: "writing-for-agents", pattern: /\bwriting[- ]for[- ]agents\b/i },
  { name: "codebase-design", pattern: /\bcodebase[- ]design\b/i },
];

function readInput() {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    process.stdin.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_INPUT_BYTES) {
        process.stdin.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(null);
      }
    });
    process.stdin.on("error", () => resolve(null));
  });
}

function emit(eventName, additionalContext) {
  if (!additionalContext) return;
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: { hookEventName: eventName, additionalContext },
    })}\n`,
  );
}

function asksForPrompt(text) {
  // Match direct requests, not quoted examples or reports about the router.
  const request = text.trim()
    .replace(/^(?:ciao|salve|buongiorno)[,!\s]+/i, "")
    .replace(/^(?:per favore|ora|adesso)[,:!\s]+/i, "");
  const actions = "(?:fammi|fai|crea(?:mi)?|scrivi(?:mi)?|prepara(?:mi)?|riscrivi(?:mi)?|migliora|rivedi|rifai|sistema|write|create|improve|rewrite)";
  const polite = "(?:(?:puoi|potresti)\\s+(?:farmi|fare|creare|scrivere|preparare|riscrivere|migliorare|rivedere)|(?:mi|ci)\\s+(?:fai|scrivi|crei|prepari|riscrivi)|(?:can|could)\\s+you\\s+(?:write|create|improve|rewrite))";
  const desire = "(?:vorrei|voglio|mi serve|ho bisogno di)";
  const article = "(?:(?:il|un|uno|questo|questi|i|dei|the|a|this)\\s+)?";
  const writingRequest = new RegExp(`^(?:${actions}|${polite}|${desire})\\s+${article}prompts?\\b`, "i");
  const explicitRoleRequest = /^(?:chiama|avvia|attiva|usa|invoke|call)\s+(?:(?:il|the)\s+)?prompt[ _-]?agent\b/i;
  return writingRequest.test(request) || explicitRoleRequest.test(request);
}

function promptContext(prompt) {
  const text = typeof prompt === "string" ? prompt : "";
  if (!text) return "";

  const explicitSkills = skillRules
    .filter(({ pattern }) => pattern.test(text))
    .map(({ name }) => {
      const directory = name === "handoff" ? "Handoff" : name;
      return `Read and apply the explicitly requested skill at .agents/skills/${directory}/SKILL.md.`;
    });

  if (asksForPrompt(text)) {
    explicitSkills.push(
      "This is a prompt-writing request: the coordinator must call Prompt Agent. Before drafting read/apply .agents/skills/writing-for-agents/SKILL.md and .agents/skills/grilling/SKILL.md; report the decision frontier and actual skill_usage. Do not execute the task described by the prompt.",
    );
  }

  const asksForHandoff = /\bhandoff\b|\bpassaggio\b.{0,40}\b(chat|agente|task)\b/i.test(text);
  if (asksForHandoff && !explicitSkills.some((hint) => hint.toLowerCase().includes("/handoff/"))) {
    explicitSkills.push("This asks for a handoff: read and apply .agents/skills/Handoff/SKILL.md.");
  }

  const asksForGrilling = /\bgrilling\b|\bgriglia(?:re)?\b/i.test(text);
  if (asksForGrilling && !explicitSkills.some((hint) => hint.includes("/grilling/"))) {
    explicitSkills.push("This asks for grilling: read and apply .agents/skills/grilling/SKILL.md.");
  }

  if (explicitSkills.length > 0) {
    return `FolderRocket routing hint: ${explicitSkills.join(" ")} The coordinator owns dispatch and must preserve task permissions.`;
  }

  if (/folderrocket|planet graph|tree rocket|fly to another planet/i.test(text) && /\b(implement|execute|fix|repair|correct|stabilize|esegui|correggi|sistema|risolvi)\b/i.test(text)) {
    return "FolderRocket routing hint: for a cross-module change, have the coordinator preserve R IDs, request Architect's read-only contract when needed, then explicitly dispatch one owner per file area. Agent TOMLs configure roles but do not start them. The coordinator owns tests, docs, and final review.";
  }

  return "";
}

const input = await readInput();
if (!input || typeof input !== "object") process.exit(0);

const eventName = input.hook_event_name;
if (eventName === "SessionStart") {
  emit(
    eventName,
    "FolderRocket workspace: read AGENTS.md and .codex/agents/README.md, then consult the canonical skill catalog at .agents/skills/README.md. Every invoked role must select matching skills automatically, read/apply their SKILL.md before work, and return actual skill_usage. Prompt Agent always reads writing-for-agents and grilling and checks its decision frontier. Project skills are discoverable but do not dispatch agents; the main coordinator explicitly chooses skills and starts roles through available agent tooling. Preserve R IDs, ownership, permissions, and the existing working-tree state.",
  );
} else if (eventName === "UserPromptSubmit") {
  emit(eventName, promptContext(input.prompt));
} else if (eventName === "SubagentStart") {
  const roleHint = Object.hasOwn(roleHints, input.agent_type) ? roleHints[input.agent_type] : "";
  emit(eventName, roleHint ? `${skillActivationHint} ${roleHint}` : "");
}
