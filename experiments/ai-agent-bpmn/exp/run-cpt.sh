#!/bin/bash
# Usage: run-cpt.sh <path/to/ai-agent-chat-with-tools.bpmn>
# Runs the tutorial's CPT suite (6 scenarios) against the given BPMN in a fresh copy. Prints CPT_RESULT line.
set -u
BPMN=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
# serialize runs (one Zeebe container at a time) and log lock wait so it can be excluded from timing
LOCK="/private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/exp2/cpt.lock"; T0=$(date +%s)
until mkdir "$LOCK" 2>/dev/null; do sleep 2; done
trap 'rmdir "$LOCK"' EXIT
echo "$(date +%s) wait=$(($(date +%s)-T0))s caller=$(dirname "$BPMN")" >> "/private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/exp2/cpt-waits.log"
RUN=$(mktemp -d "/private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/exp2/cpt-runs/run.XXXXXX")
cp -R "/private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/exp2/cpt-template/." "$RUN/" && cp "$BPMN" "$RUN/ai-agent-chat-with-tools.bpmn"
cd "$RUN/test" && mvn -B -q test > "$RUN/mvn.log" 2>&1; rc=$?
R=$(grep -hE 'Tests run:' target/surefire-reports/*.txt 2>/dev/null | tail -1)
rm -f "$RUN/ai-agent-chat-with-tools.bpmn" "$RUN"/test/target/classes/*.bpmn
echo "CPT_RESULT rc=$rc ${R:-no-surefire-report} log=$RUN/mvn.log"
[ $rc -ne 0 ] && grep -E 'FAIL|Error|Expected|but was|ERROR' "$RUN/mvn.log" | grep -v '^\s*at ' | head -25
exit $rc
