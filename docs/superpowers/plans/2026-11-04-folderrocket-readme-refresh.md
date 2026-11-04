# FolderRocket README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the outdated root README with a complete, polished English introduction for FolderRocket, using the existing logo as its only image.

**Architecture:** Keep the root README as a balanced product and contributor entry point. Display the existing logo from `src/assets/folderrocket-mark.png`; retain detailed development and release instructions in their existing docs.

**Tech Stack:** Markdown, Windows PowerShell, existing React/Vite/Electron application.

**Spec:** Approved README design in the conversation on 2026-11-04, updated by the user: English; balanced between users and developers; complete current-state feature and setup guide; use the existing logo only; clearly distinguish shipped behavior from future ideas.

## Global Constraints

- Describe only behavior present in the current application; identify local integrations and limitations accurately.
- Preserve existing README language as English and keep detailed technical guidance in linked documents.
- Use only the existing FolderRocket logo; do not add screenshots or other images.
- Do not implement the future web-page RocketBubble idea as part of this README task.
- Do not commit or push unless separately requested.

## Review Focus

- The logo link and internal document links must resolve from the repository root.
- Installation and development commands must match current `package.json` scripts and repository guidance.
- Product claims must distinguish the Gmail-only browser bridge from any future general web-page extension.
- Privacy wording must not imply that optional AI or mail integrations are offline or automatic.

### Task 1: Refresh the root README

**Files:**
- Modify: `README.md`
- Test: no application test changes; validate Markdown links, command references, logo path, and `git diff --check`.

**Interfaces:**
- The README displays `src/assets/folderrocket-mark.png` by a repository-relative Markdown image link.

- [x] Update this plan to reflect the user's instruction to omit screenshots and keep only the existing logo.
- [x] Rewrite `README.md` with a concise product introduction, current feature overview, privacy and integration notes, known limitations, Windows installation/package path, developer setup, verification commands, and links to detailed docs.
- [x] Check each Markdown link and command against the repository; run `git diff --check` and review the final structure and logo placement.

