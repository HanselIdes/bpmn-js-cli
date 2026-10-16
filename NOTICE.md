# Notice

This repository is a fork of [bpmn-io/bpmn-js-cli](https://github.com/bpmn-io/bpmn-js-cli) and is
released under the MIT License in `LICENSE`, the same license as upstream bpmn-js-cli. The Camunda
commands, the headless runner and the auto layout tidy step are new code under that license.

Some files under `experiments/ai-agent-bpmn/` are not original to this fork and keep the terms of
their source. They are included only so the experiment can be reproduced:

- The blueprint BPMN (`scorer/canon/`), the two forms, the test scenarios and the test project
  (`exp/cpt-template/`) come from [camunda/camunda-8-tutorials](https://github.com/camunda/camunda-8-tutorials),
  which does not state a license.
- `scorer/agent-props.json`, `scorer/http-props.json` and the `agent-props` and `http-props` files in
  `exp/runs/` list properties of Camunda's AI Agent and REST Outbound connector templates.
- Run outputs under `exp/runs/` were written by AI agents and embed those connector template settings.

The MIT License does not extend to those files. If you are a rights holder and want a file removed, open an issue.
