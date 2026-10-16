# Common rules (all methods)

Goal: produce `ai-agent-chat-with-tools.bpmn` in your run directory that matches the spec at
/private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/exp2/spec.md as closely as possible.

## Done gate (the task is complete only when both pass on your final file)
1. `c8ctl bpmn lint <your file>` reports **0 errors**. Warnings are allowed.
2. `/private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/exp2/run-cpt.sh <your file>` prints `CPT_RESULT rc=0 Tests run: 6, Failures: 0, Errors: 0`.
   It runs the existing Camunda Process Test suite (6 scenarios) against your file. It can queue
   behind other runs; that is expected. Run it with a Bash timeout of 600000 ms.

Stop when both pass, or after 12 lint+CPT iterations. Then stop working: do not polish further.

## Allowed for every method
- Reading the spec, `c8ctl` (lint, `element-template search|info|get-properties|get|apply`, `bpmn format`),
  `/private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/exp2/run-cpt.sh`, and the CPT test files under /private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/exp2/cpt-template (read-only).
- Element templates are cached locally; `c8ctl element-template apply` works offline.

## Forbidden (isolation)
- Reading anything under /private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/exp2-private, /private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/exp2/runs/<other runs>, or /private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/exp2/cpt-runs.
- Fetching the camunda/camunda-8-tutorials repository or any copy of this process from the web or GitHub.
- Searching the web for the solution. Camunda docs lookups are fine.
- Spawning sub-agents.

## Log
Append one line per gate attempt to `log.txt` in your run directory:
`<n> lint_errors=<x> lint_warnings=<y> cpt=<pass|fail> <short note>`.

## Final report (short, plain text)
Gate attempts count, first-attempt lint errors and CPT result, final results, the 3 hardest
problems you hit, and any spec item you could not express with your method.
