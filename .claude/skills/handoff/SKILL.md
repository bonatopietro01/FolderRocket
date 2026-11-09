---
name: handoff
description: Create a handoff document when the user asks to hand off current work, prepare another chat or agent to continue, or summarize the conversation for continuation.
argument-hint: "What will the next session be used for?"
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS (`$TMPDIR`, else `/tmp`; `%TEMP%` on Windows) - not the current workspace.

Include a "suggested skills" section in the document, naming which SKILL.md files the next agent should read using the available file tools.

When operating under a read-only role, return the document content and suggested destination to the coordinator, who saves it within the authorized scope.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
