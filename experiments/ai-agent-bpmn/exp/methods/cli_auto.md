# Method: extended bpmn-js-cli

Model the process by writing a command script `model.js` in your run directory and running it with
the headless runner of the extended bpmn-js-cli at /private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/fork:

  node /private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/fork/bin/bpmn-js-cli.mjs run model.js --out ai-agent-chat-with-tools.bpmn [--png diagram.png] --autolayout
  node /private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/fork/bin/bpmn-js-cli.mjs template-props <templateId>
  node /private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/fork/bin/bpmn-js-cli.mjs help

Read /private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/scratchpad/fork/README.md (sections "Built in Commands", "Camunda 8 commands" and "Auto layout") first; you may read
the fork's source under lib/ if the README is not enough. Do not modify the fork.
Every change to the BPMN goes through `model.js`: do not hand-edit the generated XML and do not
post-process it with other tools (no c8ctl apply or format on the output). The PNG is a screenshot of the
rendered diagram that you can Read to check layout. Default engine is 8.10.0.

Run the runner with `--autolayout` every time: it lays out the flow nodes for you, so do not set coordinates for the main flow. The layout drops text annotations, so create them (and any other layout fix-up you still need) inside `cli.afterLayout(function() { ... })`, which runs after the layout with all elements placed.
