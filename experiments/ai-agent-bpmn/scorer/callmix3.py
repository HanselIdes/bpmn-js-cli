"""Per-run tool-call mix and model-time split, from agent transcripts.

purpose(): what a tool call was for. split(): model time before non-writing calls, by the block that ended each gap.
"""
import collections, json, os, re
from datetime import datetime

P = os.path.dirname(os.path.abspath(__file__))
ns = {'__file__': os.path.join(P, 'phases3.py')}
exec(open(os.path.join(P, 'phases3.py')).read().split('def analyse')[0], ns)
TASKS, AGENTS, classify = ns['TASKS'], ns['AGENTS'], ns['classify_call']
ts = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()

PURPOSES = ['reads docs', 'reads fork source/README', 'looks up template props', 'filters template/props output',
            'writes the artifact', 'builds output', 'runs gate', 'views render', 'other']


def purpose(name, inp):
    cmd = inp.get('command') or ''
    fp = inp.get('file_path', '')
    if name in ('Write', 'Edit'):
        return 'writes the artifact' if re.search(r'model\.js|build\.py|\.bpmn', fp) else 'other'
    if name == 'Read':
        return 'views render' if fp.endswith('.png') else ('reads docs' if re.search(r'SKILL|references|README|spec|common|methods', fp) else 'other')
    if name != 'Bash':
        return 'other'
    h = re.sub(r'^\s*cd [^;&|]+(;|&&)\s*', '', cmd).split('<<')[0]
    if re.search(r'cat\s*>', h) or re.search(r'sed -i', h):
        return 'writes the artifact'
    if 'run-cpt' in h and re.search(r'bpmn', h):
        return 'runs gate'
    if 'bpmn lint' in h:
        return 'runs gate'
    if re.search(r'bpmn-js-cli\.mjs run|build\.py|element-template apply', h):
        return 'builds output'
    if re.search(r'template-props|get-properties|element-template (info|search)', h):
        return 'looks up template props'
    if re.search(r'fork/(lib|README|test)|commands\.js|README', h):
        return 'reads fork source/README'
    if re.search(r'skills/|SKILL|references|spec\.md|common\.md|methods/', h):
        return 'reads docs'
    if re.search(r'python3? .*(props|lp)|node -e|jq|json\.load', h):
        return 'filters template/props output'
    return 'other'


def call_mix(run):
    c = collections.Counter()
    for l in open(os.path.join(TASKS, AGENTS[run] + '.output')):
        if not l.strip():
            continue
        x = json.loads(l)
        if x['type'] == 'assistant':
            for b in x['message']['content']:
                if b.get('type') == 'tool_use' and b['name'] != 'SubagentHandback':
                    c[purpose(b['name'], b['input'])] += 1
    return c


def split(run):
    rows = [json.loads(l) for l in open(os.path.join(TASKS, AGENTS[run] + '.output')) if l.strip()]
    ev = [r for r in rows if r['type'] in ('assistant', 'user')]
    calls = {}
    for r in ev:
        c = r['message'].get('content')
        if r['type'] == 'assistant' and isinstance(c, list):
            for b in c:
                if b.get('type') == 'tool_use':
                    calls[b['id']] = classify(b['name'], b.get('input'))
    out = collections.Counter()
    prev = ts(ev[0]['timestamp'])
    for r in ev[1:]:
        t = ts(r['timestamp'])
        dt = t - prev
        prev = t
        if r['type'] != 'assistant':
            continue
        b = r['message']['content'][0]
        if b['type'] == 'tool_use':
            if calls.get(b['id']) == 'edit':
                continue
            out['composing a call'] += dt
        elif b['type'] == 'thinking':
            out['reasoning'] += dt
        elif b['type'] == 'text':
            out['narration'] += dt
    return out
