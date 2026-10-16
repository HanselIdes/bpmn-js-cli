# AI Agent BPMN bake-off

Experiment, 15 to 16 October 2026: three ways to build the Camunda "AI Agent Chat With Tools" BPMN
from a plain-language spec, with Sonnet 5.5 agents. Methods: a Python generator, this repo's extended
bpmn-js-cli, and hand-written XML with the camunda-bpmn skill. Each run had to pass `c8ctl bpmn lint`
(0 errors) and the tutorial's 6-scenario Camunda Process Test suite.

## Final round (two trials per method)

| Method           | Closeness /100 | Tokens  | Active s | Layout /15 |
|------------------|----------------|---------|----------|------------|
| Python           | 87.0           | 124,234 | 168      | 8.1        |
| Extended CLI     | 85.7           | 120,878 | 138      | 5.9        |
| Hand-written XML | 89.0           | 133,216 | 164      | 9.5        |

All 6 trials passed both gates on the first attempt. Two trials per method is a small sample, so gaps
of this size are close to run-to-run noise. The CLI runs come from a tool tuned over three rounds, and
the fork's build cost is not in its numbers.

## Layout

- `exp/spec.md`, `exp/methods/`: the spec and the briefs given to the agents.
- `exp/runs/`: every trial's output (`model.js`, `build.py` or XML, the BPMN, logs, diagram). `cli1` to
  `cli8` are the CLI rounds: cli1, cli2 on the first fork, cli3, cli4 after layout fixes, cli5, cli6 after
  help, filter and flow ids, cli7, cli8 after the "omitted properties keep their default" note.
- `exp/run-cpt.sh`, `exp/cpt-template/`: the CPT runner and test suite used for the gate.
- `scorer/`: closeness scorer, aggregation, phase and call-mix analysis, results JSON per round, report
  builders (`build_report*.py`) and templates, the canonical BPMN used for scoring (`canon/`).
- `report/results-page.html`: the results page as published for the final round.
- `slim/slim.js`: the cli6 script cut from 90 to 56 lines by leaving template defaults out; lint clean,
  CPT 6/6, closeness equal to `slim/full.js`.
- `harness/`: the headless render script used for the gallery.

Scripts hold absolute paths into the session scratchpad where they were run. Agent transcripts are not
included. The canonical BPMN and CPT suite come from camunda/camunda-8-tutorials: keep this repo private.

## Fork changes made for the experiment

1. `help <command>` prints arguments and options.
2. `template-props --filter <text|glob> --condensed`.
3. README documents every option.
4. `append` and `connect` take an optional flow id.
5. Template help and condensed output say that omitted properties keep their default.
