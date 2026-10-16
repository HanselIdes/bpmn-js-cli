"""Aggregate experiment results.

Usage: python3 -I aggregate.py <usage.json>

usage.json maps run name -> {"tokens": int, "duration_ms": int, "tool_uses": int}
(from the agent completion notifications). For every run this script independently
re-runs lint and CPT on the final file, scores closeness against the canonical,
and subtracts CPT lock-wait time from the agent's wall-clock duration.
"""
import json, os, re, subprocess, sys

SP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXP, PRIV = os.path.join(SP, 'exp2'), os.path.join(SP, 'exp2-private')
sys.path.insert(0, PRIV)
from closeness import score  # noqa: E402

usage = json.load(open(sys.argv[1]))
# snapshot the agents' wait log once, before this script's own CPT re-runs append to it
snapshot = os.path.join(PRIV, 'cpt-waits.agents.log')
if not os.path.exists(snapshot):
    import shutil
    shutil.copy(os.path.join(EXP, 'cpt-waits.log'), snapshot)
waits = {}
for line in open(snapshot):
    m = re.search(r'wait=(\d+)s caller=(\S+)', line)
    if m:
        run = os.path.basename(m.group(2))
        waits[run] = waits.get(run, 0) + int(m.group(1))

rows = []
for run in sorted(usage):
    f = os.path.join(EXP, 'runs', run, 'ai-agent-chat-with-tools.bpmn')
    row = dict(run=run, method=re.sub(r'\d+$', '', run), **usage[run])
    if not os.path.exists(f):
        row.update(exists=False)
        rows.append(row)
        continue
    lint = subprocess.run(['c8ctl', 'bpmn', 'lint', f], capture_output=True, text=True)
    m = re.search(r'\((\d+) errors?, (\d+) warnings?\)', lint.stdout + lint.stderr)
    row['lint_errors'] = int(m.group(1)) if m else (0 if 'No issues' in lint.stdout else None)
    row['lint_warnings'] = int(m.group(2)) if m else 0
    cpt = subprocess.run([os.path.join(EXP, 'run-cpt.sh'), f], capture_output=True, text=True)
    cm = re.search(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+)', cpt.stdout)
    row['cpt'] = f'{int(cm.group(1)) - int(cm.group(2)) - int(cm.group(3))}/{cm.group(1)}' if cm else 'no report'
    row['cpt_pass'] = cpt.returncode == 0
    s = score(os.path.join(PRIV, 'canon', 'canonical.bpmn'), f)
    row['closeness'] = s['total']
    row['parts'] = {k: s[k] for k in ('structure', 'configuration', 'annotations', 'layout')}
    row['config_missing'] = s['detail']['config_missing']
    row['config_extra'] = s['detail']['config_extra']
    row['missing_config'] = s['detail']['missing_config']
    row['extra_config'] = s['detail']['extra_config']
    row['missing_structure'] = s['detail']['missing_structure']
    row['mean_shape_offset_px'] = s['detail']['mean_shape_offset_px']
    # the gate wait was excluded inside the agents' runs too; subtract our own re-run? no: only agent runs logged before this script
    row['lock_wait_s'] = waits.get(run, 0)
    row['active_s'] = round(usage[run]['duration_ms'] / 1000 - waits.get(run, 0))
    row['exists'] = True
    rows.append(row)

json.dump(rows, open(os.path.join(PRIV, 'results.json'), 'w'), indent=2)
for r in rows:
    print({k: r.get(k) for k in ('run', 'lint_errors', 'lint_warnings', 'cpt', 'closeness', 'parts', 'tokens', 'active_s', 'lock_wait_s', 'tool_uses')})
