"""Split each trial's wall-clock time into phases, from the agent transcripts.

Writes phases.json: {run: {"segments": [[category, seconds], ...] (chronological, merged), "totals": {...}, "span_s": n}}

Attribution rules (each gap between consecutive transcript events belongs to exactly one category):
  gap before an assistant block  = the model producing that block
      Write/Edit tool_use  -> creating (no check has run yet) or fixing (after the first lint, test or render)
      anything else        -> thinking
  gap before a tool_result       = the tool running, labelled by the call:
      Read/Grep/Glob, cat/ls/grep/find/template-props/element-template info|search|get-properties -> looking up
      c8ctl bpmn lint                                                        -> linting
      run-cpt.sh                                                             -> test suite (minus logged queue wait -> queued)
      build.py / bpmn-js-cli run / element-template apply / bpmn format      -> executing
      Write/Edit                                                             -> creating or fixing (same rule)
      anything else                                                          -> other
"""
import json, os, re, sys

P = os.path.dirname(os.path.abspath(__file__))
TASKS = os.path.join(os.path.dirname(P), '..', 'tasks')
TASKS = '/private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/tasks'
AGENTS = {'py1': 'a95af065c2ff89f13', 'py2': 'a0f42894aee69b47b', 'cli1': 'ab47217565c7bfdfa', 'cli2': 'a1099250c44e7c9b3',
          'cli3': 'a342ab756a3b3fd30', 'cli4': 'a30aa0d3dbfe5aaaf', 'hand1': 'a87c4f7102f9bebf0', 'hand2': 'a5fe82d1312b5c4d7'}
res = {r['run']: r for r in json.load(open(os.path.join(P, 'results.v1.json'))) + json.load(open(os.path.join(P, 'results.v2.json')))}

from datetime import datetime


def ts(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()


def classify_call(name, inp):
    cmd = (inp.get('command') or '') if isinstance(inp, dict) else ''
    if name in ('Write', 'Edit', 'NotebookEdit'):
        return 'edit'
    if name in ('Read', 'Grep', 'Glob'):
        return 'looking up'
    if name == 'Bash':
        cmd = re.sub(r'^\s*cd [^;&|]+(;|&&)\s*', '', cmd)
        head = cmd.split('<<')[0]          # ignore heredoc bodies: a script that mentions "bpmn lint" is not a lint run
        if re.search(r'(^|[;&]\s*)(cat\s*>+|tee\s)', head) or re.search(r'sed -i', head) and 'lint' not in head:
            return 'edit'
        if re.search(r'run-cpt\.sh +\S*bpmn', head) and not re.match(r'\s*(cat|head|ls|grep)\b', head):
            return 'test suite'
        if re.search(r'bpmn lint', head):
            return 'linting'          # a chained rebuild + lint counts as linting
        if re.search(r'build\.py|bpmn-js-cli\.mjs run|element-template apply|bpmn format|^\s*python3? \S*\.py|^\s*python3? -\s*$', head):
            return 'executing'
        if re.search(r'^\s*(cat|ls|grep|rg|find|head|tail|sed -n|wc|echo|pwd|test|mkdir|python3? -c|node -e|c8ctl --version)\b|template-props|element-template (info|search|get-properties|get)\b|rtk proxy (cat|ls|grep)', head):
            return 'looking up'
        return 'other'
    return 'other'


def analyse(run):
    rows = [json.loads(l) for l in open(os.path.join(TASKS, AGENTS[run] + '.output')) if l.strip()]
    events = [r for r in rows if r['type'] in ('assistant', 'user')]
    calls = {}
    for r in events:
        c = r.get('message', {}).get('content')
        if r['type'] == 'assistant' and isinstance(c, list):
            for b in c:
                if b.get('type') == 'tool_use':
                    calls[b['id']] = classify_call(b['name'], b.get('input'))
    segs, prev, checked = [], ts(events[0]['timestamp']), False
    for r in events[1:]:
        t = ts(r['timestamp'])
        dt = max(0.0, t - prev)
        prev = t
        c = r.get('message', {}).get('content')
        cat = 'thinking'
        if r['type'] == 'assistant' and isinstance(c, list):
            kinds = [calls.get(b['id']) for b in c if b.get('type') == 'tool_use']
            if 'edit' in kinds:
                cat = 'fixing' if checked else 'creating'
        elif r['type'] == 'user' and isinstance(c, list):
            ids = [b.get('tool_use_id') for b in c if b.get('type') == 'tool_result']
            kind = calls.get(ids[0]) if ids else None
            if kind == 'edit':
                cat = 'fixing' if checked else 'creating'
            elif kind:
                cat = kind
                if kind in ('linting', 'test suite', 'executing') and cat != 'executing':
                    checked = True
            else:
                cat = 'thinking'
        segs.append([cat, dt])
    # split queue wait out of the test-suite time
    wait = res[run].get('lock_wait_s', 0)
    tests = [s for s in segs if s[0] == 'test suite']
    tot_tests = sum(s[1] for s in tests)
    if wait and tot_tests:
        take = min(wait, tot_tests)
        for s in tests:
            share = take * s[1] / tot_tests
            s[1] -= share
            segs.append(['queued', 0])  # placeholder to keep structure simple
        # re-insert queue as its own segment right before the (first) test segment
        i = next(k for k, s in enumerate(segs) if s[0] == 'test suite')
        segs = [s for s in segs if not (s[0] == 'queued' and s[1] == 0)]
        i = next(k for k, s in enumerate(segs) if s[0] == 'test suite')
        segs.insert(i, ['queued', take])
    merged = []
    for cat, dt in segs:
        if merged and merged[-1][0] == cat:
            merged[-1][1] += dt
        else:
            merged.append([cat, dt])
    totals = {}
    for cat, dt in merged:
        totals[cat] = totals.get(cat, 0) + dt
    return dict(segments=[[c, round(d, 2)] for c, d in merged], totals={k: round(v, 1) for k, v in totals.items()},
                span_s=round(ts(events[-1]['timestamp']) - ts(events[0]['timestamp']), 1))


out = {run: analyse(run) for run in AGENTS}
json.dump(out, open(os.path.join(P, 'phases.json'), 'w'), indent=1)
cats = ['thinking', 'looking up', 'creating', 'fixing', 'executing', 'linting', 'test suite', 'queued', 'other']
print('run   span ' + ' '.join(f'{c[:7]:>7}' for c in cats) + '   agent_duration')
for run in ['py1', 'py2', 'cli1', 'cli2', 'cli3', 'cli4', 'hand1', 'hand2']:
    o = out[run]
    print(f'{run:5} {o["span_s"]:5.0f} ' + ' '.join(f'{o["totals"].get(c, 0):7.1f}' for c in cats) + f'   {res[run]["duration_ms"] / 1000:.0f}')
