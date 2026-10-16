"""Build the results artifact from verified results.

Usage: python3 -I build_report.py <out.html>
"""
import base64, json, os, re, statistics, sys

P = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(P, 'results.v1.json'))) + json.load(open(os.path.join(P, 'results.v2.json'))) + json.load(open(os.path.join(P, 'results.v3.json'))) + json.load(open(os.path.join(P, 'results.v4.json'))) + json.load(open(os.path.join(P, 'results.v5.json'))) + json.load(open(os.path.join(P, 'results.v6.json')))
by = {r['run']: r for r in rows}
# the clock stops at each run's first passing gate; cli12 ran the gate again after a layout fix (about 50.3 s)
by['cli12']['active_s_measured'] = by['cli12']['active_s']
by['cli12']['active_s'] = round(by['cli12']['active_s'] - 50.3, 1)
from decimal import Decimal, ROUND_HALF_UP
def rnd(x, n=1):
    q = Decimal(1).scaleb(-n)
    return str(Decimal(str(round(x, 6))).quantize(q, rounding=ROUND_HALF_UP))

METHODS = [
    ('cli', 'CLI', ['cli11', 'cli12'], 'var(--s2)'),
    ('hand', '/camunda-bpmn', ['hand1', 'hand2'], 'var(--s3)'),
    ('python', 'Python', ['py1', 'py2'], 'var(--s1)'),
]
GATE_ATTEMPTS = {'py1': 1, 'py2': 1, 'cli1': 2, 'cli2': 1, 'cli3': 1, 'cli4': 1, 'hand1': 1, 'hand2': 1, 'cli7': 1, 'cli8': 1, 'cli9': 1, 'cli10': 1, 'cli11': 1, 'cli12': 2}
ARTIFACT = {'py1': 'build.py, 161 lines', 'py2': 'build.py, 189 lines', 'cli1': 'model.js, 107 lines', 'cli2': 'model.js, 79 lines',
            'cli3': 'model.js', 'cli4': 'model.js', 'hand1': 'XML by hand', 'hand2': 'XML by hand'}


def mean(runs, key):
    return statistics.mean(by[r][key] for r in runs)


def img(name):
    with open(os.path.join(P, 'renders', 'crop', name + '.jpg'), 'rb') as f:
        return 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode()


def fmt_k(n):
    return f'{n / 1000:.0f}k'


# ---------- dot-strip charts ----------
def strip(metric, label, unit, lo, hi, ticks, fmt, better):
    W, H, L, R, ROW = 900, 3 * 34 + 44, 230, 70, 34
    x = lambda v: L + (v - lo) / (hi - lo) * (W - L - R)
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-labelledby="t-{metric}" class="strip">',
           f'<title id="t-{metric}">{label} per trial, by method</title>']
    for t in ticks:
        out.append(f'<line x1="{x(t):.1f}" x2="{x(t):.1f}" y1="8" y2="{H - 30}" class="grid"/>')
        out.append(f'<text x="{x(t):.1f}" y="{H - 12}" class="tick" text-anchor="middle">{fmt(t)}</text>')
    for i, (key, name, runs, color) in enumerate(METHODS):
        cy = 24 + i * ROW
        out.append(f'<text x="{L - 14}" y="{cy + 4}" class="rowlabel" text-anchor="end">{name}</text>')
        vals = [by[r][metric] for r in runs]
        out.append(f'<line x1="{x(min(vals)):.1f}" x2="{x(max(vals)):.1f}" y1="{cy}" y2="{cy}" class="range" style="stroke:{color}"/>')
        for r in runs:
            v = by[r][metric]
            hollow = key == 'cliv1'
            fill = 'var(--surface)' if hollow else color
            out.append(f'<g class="dot" tabindex="0" data-tip="{r}: {fmt(v)}{unit}">'
                       f'<circle cx="{x(v):.1f}" cy="{cy}" r="14" class="hit"/>'
                       f'<circle cx="{x(v):.1f}" cy="{cy}" r="6" style="fill:{fill};stroke:{color}" class="mark"/></g>')
        m = statistics.mean(vals)
        out.append(f'<text x="{(x(min(vals)) + x(max(vals))) / 2:.1f}" y="{cy - 11}" class="val" text-anchor="middle">{fmt(m)}{unit}</text>')
    out.append('</svg>')
    return '\n'.join(out)


# ---- estimated cost at Claude Sonnet 5.5 API rates (platform.claude.com/docs/en/about-claude/pricing, fetched 16 Oct 2026)
PRICE = {'input': 2.0, 'cache_write_5m': 2.5, 'cache_read': 0.10, 'output': 10.0}   # USD per million tokens
_phraw = json.load(open(os.path.join(P, 'phases.v6.json')))
_agents = dict(re.findall(r"'(\w+)':\s*'(\w+)'", re.search(r"AGENTS = \{(.*?)\}", open(os.path.join(P, 'phases3.py')).read(), re.S).group(1)))
def _usage(run):
    seen, wr = {}, 0
    for l in open(os.path.join(P, 'tasks3', _agents[run] + '.output')):
        if not l.strip():
            continue
        x = json.loads(l)
        if x['type'] != 'assistant':
            continue
        mm = x['message']
        seen[mm.get('id')] = mm.get('usage') or {}
        for b in mm['content']:
            if b.get('type') == 'tool_use' and b['name'] in ('Write', 'Edit'):
                i = b['input']
                wr += len(i.get('content') or i.get('new_string') or '')
    u = {k: sum(v.get(k, 0) for v in seen.values()) for k in ('input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens')}
    u['write_chars'] = wr
    return u
_U = {r: _usage(r) for r in _agents if r in _phraw}
_gen = lambda r: sum(_phraw[r]['totals'].get(k, 0) for k in ('thinking', 'creating', 'fixing'))
# transcripts record placeholder output counts, so output tokens are estimated from generation time at the rate measured on file writes
_rate = (sum(u['write_chars'] for u in _U.values()) / 3.5) / sum(_phraw[r]['totals'].get('creating', 0) + _phraw[r]['totals'].get('fixing', 0) for r in _U)
COST_PARTS = {}
OUT_TOK = {}
for r, u in _U.items():
    out = _rate * _gen(r)
    OUT_TOK[r] = out
    parts = {'cache_write': u['cache_creation_input_tokens'] * PRICE['cache_write_5m'] / 1e6, 'cache_read': u['cache_read_input_tokens'] * PRICE['cache_read'] / 1e6,
             'input': u['input_tokens'] * PRICE['input'] / 1e6, 'output': out * PRICE['output'] / 1e6}
    COST_PARTS[r] = parts
    if r in by:
        by[r]['cost'] = sum(parts.values())
print('output rate tokens/s', round(_rate, 1))


charts = [
    ('Closeness to blueprint <span>0 to 100, higher is closer</span>', strip('closeness', 'Closeness', '', 82, 92, [82, 84, 86, 88, 90, 92], lambda v: rnd(v), 'higher is closer &rarr;')),
    ('Estimated cost per run <span>USD at Sonnet 5.5 API rates, lower is cheaper</span>', strip('cost', 'Cost', '', 0.35, 0.75, [0.4, 0.5, 0.6, 0.7], lambda v: '$' + rnd(v, 2), 'lower is cheaper &larr;')),
    ('Time to first passing gate <span>seconds, queue time excluded</span>', strip('active_s', 'Active time', ' s', 90, 300, [90, 120, 150, 180, 210, 240, 270, 300], lambda v: rnd(v, 0), 'seconds, queue time excluded')),
]

# ---------- results table ----------
trs = []
for key, name, runs, color in METHODS:
    for r in runs:
        d = by[r]
        p = d['parts']
        trs.append(f'''<tr class="{'muted-row' if key == 'cliv1' else ''}">
<td><span class="sw" style="background:{color}"></span>{r}</td><td>{name}</td>
<td class="num">{d['lint_errors']}</td><td class="num">{d['cpt']}</td><td class="num">{GATE_ATTEMPTS[r]}</td>
<td class="num strong">{d['closeness']:.1f}</td>
<td class="num">{p['structure']:.1f}</td><td class="num">{p['configuration']:.1f}</td><td class="num">{p['annotations']:.1f}</td><td class="num">{p['layout']:.1f}</td>
<td class="num">{d['tokens']:,}</td><td class="num">{d['active_s']}</td><td class="num">{d['lock_wait_s']}</td><td class="num">{d['tool_uses']}</td></tr>''')

summary_rows = []
for key, name, runs, color in METHODS:
    summary_rows.append(f'''<tr class="{'muted-row' if key == 'cliv1' else ''}"><td><span class="sw" style="background:{color}"></span>{name}</td>
<td class="num strong">{mean(runs, 'closeness'):.1f}</td><td class="num">{mean(runs, 'tokens'):,.0f}</td><td class="num">{mean(runs, 'active_s'):.0f}</td>
<td class="num">{statistics.mean(by[r]['parts']['configuration'] for r in runs):.1f}</td><td class="num">{statistics.mean(by[r]['parts']['layout'] for r in runs):.1f}</td></tr>''')

gallery_items = [(r, r, color, name) for name, _, runs, color in [(m[1], m[0], m[2], m[3]) for m in METHODS] for r in runs]
DEFAULT_RUN = 'cli11'
gallery_buttons = '\n'.join(
    f'<button type="button" class="gbtn{" on" if k == DEFAULT_RUN else ""}" style="--c:{color}" title="{name}" data-img="g-{k}" aria-pressed="{"true" if k == DEFAULT_RUN else "false"}">{lab}</button>'
    for k, lab, color, name in gallery_items)
gallery_legend = '<ul class="legend" aria-label="Method colours">' + ''.join(
    f'<li><span class="sw" style="background:{color}"></span>{name}</li>' for _, name, _, color in METHODS) + '</ul>'
gallery_imgs = '\n'.join(
    f'<img id="g-{k}" src="{img(k)}" alt="Rendered diagram: {lab}"{"" if k == DEFAULT_RUN else " hidden"}>'
    for k, lab, _c, _n in gallery_items)
gallery_blueprint = f'<img id="g-canonical" src="{img("canonical")}" alt="Rendered diagram: blueprint">'


# ---------- phase charts ----------
phases = json.load(open(os.path.join(P, 'phases.v6.json')))
def _retotal(run):
    tot = {}
    for c, d in phases[run]['segments']:
        tot[c] = tot.get(c, 0) + d
    phases[run]['totals'] = {k: round(v, 1) for k, v in tot.items()}
# cli12: drop the rework and the second test run after its first passing gate
_seg = phases['cli12']['segments']
phases['cli12']['segments'] = _seg[:30] + _seg[42:]
_retotal('cli12')
# cli11: its only write (creating model.js) was classed as fixing
phases['cli11']['segments'] = [['creating' if c == 'fixing' else c, d] for c, d in phases['cli11']['segments']]
_retotal('cli11')

CATS = [('thinking', 'Thinking', 'var(--ph-think)'), ('looking up', 'Looking up', 'var(--p1)'), ('creating', 'Creating', 'var(--p2)'),
        ('fixing', 'Fixing', 'var(--p3)'), ('executing', 'Executing', 'var(--p4)'), ('linting', 'Linting', 'var(--p5)'),
        ('test suite', 'Test suite', 'var(--p6)')]
CAT_KEYS = [c[0] for c in CATS]
CAT_LABEL = {k: l for k, l, _ in CATS}
CAT_FILL = {k: f for k, _, f in CATS}


def norm_totals(run):
    d = dict(phases[run]['totals'])
    d['looking up'] = d.get('looking up', 0) + d.pop('other', 0)   # misc shell housekeeping, at most 3 s per run
    return d


def norm_segments(run):
    out = []
    for c, d in phases[run]['segments']:
        c = 'looking up' if c == 'other' else c
        if c == 'queued':
            continue
        if out and out[-1][0] == c:
            out[-1][1] += d
        else:
            out.append([c, d])
    return out


DEFS = ('<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
        '<rect width="6" height="6" style="fill:var(--ph-queue)"/><line x1="0" y1="0" x2="0" y2="6" style="stroke:var(--muted);stroke-width:2"/></pattern></defs>')


DEFS = ''


def seg_rect(x, y, w, h, cat, secs, run=None):
    tip = f'{run + ": " if run else ""}{CAT_LABEL[cat]} {secs:.0f} s'
    return (f'<g class="seg" tabindex="0" data-tip="{tip}"><rect x="{x:.1f}" y="{y}" width="{max(w, 0.8):.1f}" height="{h}" '
            f'style="fill:{CAT_FILL[cat]}" class="segr"/></g>')


def legend():
    items = ''.join(f'<li><svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" rx="2" style="fill:{f}"/>'
                    f'<rect width="14" height="14" rx="2" class="swo"/></svg>{l}</li>' for k, l, f in CATS)
    return f'<ul class="legend" aria-label="Phase colours">{items}</ul>'


def method_chart():
    groups = [('CLI', ['cli11', 'cli12']), ('/camunda-bpmn', ['hand1', 'hand2']), ('Python', ['py1', 'py2'])]
    W, L, R, ROW, TOP = 900, 230, 60, 40, 8
    H = TOP + ROW * len(groups) + 34
    x = lambda v: L + v / 220 * (W - L - R)
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-labelledby="t-pm" class="strip">{DEFS}'
           '<title id="t-pm">Mean seconds per phase, by method, queue time excluded</title>']
    for t in range(0, 221, 50):
        out.append(f'<line x1="{x(t):.1f}" x2="{x(t):.1f}" y1="{TOP}" y2="{H - 30}" class="grid"/>'
                   f'<text x="{x(t):.1f}" y="{H - 12}" class="tick" text-anchor="middle">{t} s</text>')
    for i, (name, runs) in enumerate(groups):
        cy = TOP + i * ROW
        out.append(f'<text x="{L - 14}" y="{cy + 24}" class="rowlabel" text-anchor="end">{name}</text>')
        cur = 0.0
        for k in CAT_KEYS:
            v = statistics.mean(norm_totals(r).get(k, 0) for r in runs)
            if v <= 0:
                continue
            out.append(seg_rect(x(cur), cy + 8, x(cur + v) - x(cur) - 1.5, 26, k, v))
            if x(cur + v) - x(cur) > 30:
                cls = 'inkthink' if k == 'thinking' else 'ink'
                out.append(f'<text x="{(x(cur) + x(cur + v)) / 2 - 0.7:.1f}" y="{cy + 25}" class="seglabel {cls}" text-anchor="middle">{v:.0f}</text>')
            cur += v
        out.append(f'<text x="{x(cur) + 8:.1f}" y="{cy + 25}" class="val">{rnd(statistics.mean(by[r]["active_s"] for r in runs), 0)} s</text>')
    out.append('</svg>')
    return '\n'.join(out)


def timeline_chart():
    order = [('CLI', ['cli11', 'cli12']), ('/camunda-bpmn', ['hand1', 'hand2']), ('Python', ['py1', 'py2'])]
    W, L, R, ROW, GAP, TOP = 900, 170, 70, 24, 14, 6
    short = {'py': 'Python', 'cli': 'CLI', 'hand': '/camunda-bpmn'}
    short_of = lambda r: 'CLI' if r in ('cli11', 'cli12') else short[r.rstrip('0123456789')]
    rows_n = sum(len(r) for _, r in order)
    H = TOP + rows_n * ROW + (len(order) - 1) * GAP + 36
    x = lambda v: L + v / 200 * (W - L - R)
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-labelledby="t-tl" class="strip">{DEFS}'
           '<title id="t-tl">What each trial was doing, second by second</title>']
    for t in range(0, 201, 50):
        out.append(f'<line x1="{x(t):.1f}" x2="{x(t):.1f}" y1="{TOP}" y2="{H - 30}" class="grid"/>'
                   f'<text x="{x(t):.1f}" y="{H - 12}" class="tick" text-anchor="middle">{t} s</text>')
    y = TOP
    for gi, (name, runs) in enumerate(order):
        for r in runs:
            vlabel = short_of(r)
            out.append(f'<text x="{L - 10}" y="{y + 16}" class="rowlabel" text-anchor="end">{r} <tspan class="dim">{vlabel}</tspan></text>')
            cur = 0.0
            for c, d in norm_segments(r):
                if x(cur + d) - x(cur) >= 0.4:
                    out.append(seg_rect(x(cur), y + 3, x(cur + d) - x(cur) - 1, ROW - 6, c, d, r))
                cur += d
            out.append(f'<text x="{x(cur) + 8:.1f}" y="{y + 16}" class="val">{rnd(by[r]["active_s"], 0)} s</text>')
            y += ROW
        y += GAP
    out.append('</svg>')
    return '\n'.join(out)


def first_check(run):
    el, first = 0.0, None
    for c, d in norm_segments(run):
        if c in ('linting', 'test suite', 'queued') and first is None:
            first = el
        el += d
    return first, el


phase_rows = []
for key, name, runs, color in METHODS:
    for r in runs:
        t = norm_totals(r)
        phase_rows.append('<tr><td>%s</td><td>%s</td>%s<td class="num">%s</td></tr>' % (
            r, name, ''.join(f'<td class="num">{rnd(t.get(k, 0), 0)}</td>' for k in CAT_KEYS), rnd(by[r]['active_s'], 0)))

plateau_rows = []



# ---------- % change against the two baselines ----------
G = {'hand': ['hand1', 'hand2'], 'py': ['py1', 'py2'], 'auto': ['cli11', 'cli12']}
def gm(g, k, part=False):
    return statistics.mean((by[r]['parts'][k] if part else by[r][k]) for r in G[g])
def lines_written(run):
    d = os.path.join(os.path.dirname(P), 'exp2', 'runs', run)
    f = next((n for n in ('build.py', 'model.js') if os.path.exists(os.path.join(d, n))), 'ai-agent-chat-with-tools.bpmn')
    return sum(1 for l in open(os.path.join(d, f)) if l.strip())
for r in sum(G.values(), []):
    by[r]['lines'] = lines_written(r)
# label, key, from parts, lower is better, value format, unit word for a lower-is-better change
METRICS = [('Time to first passing gate', 'active_s', False, True, lambda v: rnd(v, 0) + ' s', 'less'),
           ('Estimated cost', 'cost', False, True, lambda v: '$' + rnd(v, 2), 'lower'),
           ('Tool calls', 'tool_uses', False, True, lambda v: rnd(v, 0), 'fewer'),
           ("Lines in the agent's output file", 'lines', False, True, lambda v: rnd(v, 0), 'fewer'),
           ('Closeness to blueprint (of 100)', 'closeness', False, False, lambda v: rnd(v), ''),
           ('Layout score (of 15)', 'layout', True, False, lambda v: rnd(v), '')]
def gain(base, g, k, part, lower):
    b, v = gm(base, k, part), gm(g, k, part)
    return 100 * ((b - v) / b if lower else (v - b) / b)
def runvals(g, k, part, fmt):
    return ' | '.join(f'{r} {fmt(by[r]["parts"][k] if part else by[r][k])}' for r in G[g])
def pct_cell(x, tip, lower, word):
    cls = 'good' if x > 0.5 else 'bad' if x < -0.5 else 'flat'
    if lower:
        text = f'{rnd(abs(x))}% {word}' if x >= 0 else f'{rnd(abs(x))}% more'
    else:
        text = f'{"+" if x >= 0 else "-"}{rnd(abs(x))}%'
    return f'<td class="num pct {cls}" title="{tip}">{text}</td>'
vs_rows = []
for label, k, part, lower, fmt, word in METRICS:
    tip_auto = 'CLI: ' + runvals('auto', k, part, fmt)
    vs_rows.append(f'<tr><td class="strong">{label}</td><td class="num" title="{runvals("hand", k, part, fmt)}">{fmt(gm("hand", k, part))}</td>'
                   f'<td class="num" title="{runvals("py", k, part, fmt)}">{fmt(gm("py", k, part))}</td>'
                   + ''.join(pct_cell(gain(b, 'auto', k, part, lower), tip_auto, lower, word) for b in ('hand', 'py')) + '</tr>')
GAIN = {m[1]: {b: gain(b, 'auto', m[1], m[2], m[3]) for b in ('hand', 'py')} for m in METRICS}
CLO = {g: gm(g, 'closeness') for g in G}

# phase facts quoted in the text
tm = {g: {k: statistics.mean(norm_totals(r).get(k, 0) for r in runs) for k in CAT_KEYS} for g, runs in
      [('py', G['py']), ('cli', G['auto']), ('hand', G['hand'])]}
tot = lambda g: sum(tm[g].values())
think = {g: rnd(100 * tm[g]['thinking'] / tot(g), 0) for g in tm}
create = {g: rnd(tm[g]['creating'], 0) for g in tm}
suites = [norm_totals(r).get('test suite', 0) for r in sum(G.values(), [])]
SUITE_LO, SUITE_HI = rnd(min(suites), 0), rnd(max(suites), 0)

# ---------- appendix: every CLI round ----------
ROUNDS = [(1, ['cli1', 'cli2'], 'First fork: collapsed sub-processes, annotation size ignored, no way to route a flow'),
          (2, ['cli3', 'cli4'], 'Those three layout defects fixed'),
          (3, ['cli5', 'cli6'], 'help for each command, filterable template listing, documented options, named flow ids'),
          (4, ['cli7', 'cli8'], 'Help text says omitted template properties keep their default'),
          (5, ['cli9', 'cli10'], 'Auto layout of the library alone, new brief'),
          (6, ['cli11', 'cli12'], 'Runner tidies the auto layout output, new brief (shown above)')]
def rowmean(runs, k, part=False):
    return statistics.mean((by[r]['parts'][k] if part else by[r][k]) for r in runs)
def arow(label, note, runs, bold=False):
    cells = (f'<td class="num">{rnd(rowmean(runs, "closeness"))}</td><td class="num">{rnd(rowmean(runs, "layout", True))}</td>'
             f'<td class="num">${rnd(rowmean(runs, "cost"), 2)}</td>'
             f'<td class="num">{rnd(rowmean(runs, "active_s"), 0)}</td>')
    return f'<tr><td>{label}</td><td class="wrap2">{note}</td>{cells}</tr>'
CLI_ALL = [f'cli{i}' for i in range(1, 13)]
appendix_rows = [arow(f'CLI round {n}', note, runs) for n, runs, note in ROUNDS]
appendix_rows.append(arow('<strong>All 12 CLI runs</strong>', 'Mean of every CLI run', CLI_ALL))
appendix_rows.append(arow('/camunda-bpmn', '2 runs, no tuning', G['hand']))
appendix_rows.append(arow('Python', '2 runs, no tuning', G['py']))
ALL = {k: rowmean(CLI_ALL, k, p) for k, p in (('closeness', False), ('active_s', False), ('cost', False))}
print('all12', ALL)

def _fmt_int(v):
    return f"{int(Decimal(str(round(v, 6))).quantize(Decimal(1), rounding=ROUND_HALF_UP)):,}"
ROUND_OF = {}
for n, runs, _note in ROUNDS:
    for r in runs:
        ROUND_OF[r] = f'CLI iteration {n}'
def _label(r):
    if r.startswith('py'):
        return 'Python'
    if r.startswith('hand'):
        return '/camunda-bpmn'
    return ROUND_OF[r]
token_rows = []
for r in ['cli11', 'cli12', 'hand1', 'hand2', 'py1', 'py2'] + [f'cli{i}' for i in range(10, 0, -1)]:
    u, p = _U[r], COST_PARTS[r]
    shown = r in ('cli11', 'cli12', 'hand1', 'hand2', 'py1', 'py2')
    token_rows.append(f'<tr><td>{r}</td><td>{_label(r)}{"" if shown else " (not shown above)"}</td><td class="num">{_fmt_int(u["input_tokens"])}</td><td class="num">{_fmt_int(u["cache_creation_input_tokens"])}</td>'
                      f'<td class="num">{_fmt_int(u["cache_read_input_tokens"])}</td><td class="num">{_fmt_int(OUT_TOK[r])}</td><td class="num">{_fmt_int(by[r]["tokens"])}</td>'
                      f'<td class="num">${rnd(by[r]["cost"], 3)}</td></tr>')
def _gmean(runs, f):
    return statistics.mean(f(r) for r in runs)
token_means = []
for label, runs in (('CLI (cli11, cli12)', ['cli11', 'cli12']), ('/camunda-bpmn (hand1, hand2)', ['hand1', 'hand2']), ('Python (py1, py2)', ['py1', 'py2']), ('All 12 CLI runs', [f'cli{i}' for i in range(1, 13)])):
    token_means.append(f'<tr><td><strong>Mean</strong></td><td>{label}</td><td class="num">{_fmt_int(_gmean(runs, lambda r: _U[r]["input_tokens"]))}</td><td class="num">{_fmt_int(_gmean(runs, lambda r: _U[r]["cache_creation_input_tokens"]))}</td>'
                       f'<td class="num">{_fmt_int(_gmean(runs, lambda r: _U[r]["cache_read_input_tokens"]))}</td><td class="num">{_fmt_int(_gmean(runs, lambda r: OUT_TOK[r]))}</td><td class="num">{_fmt_int(_gmean(runs, lambda r: by[r]["tokens"]))}</td>'
                       f'<td class="num">${rnd(_gmean(runs, lambda r: by[r]["cost"]), 3)}</td></tr>')
import html as _html
CODE = [('cli', 'CLI', 'var(--s2)', 'cli12', 'model.js'), ('hand', '/camunda-bpmn', 'var(--s3)', 'hand2', 'ai-agent-chat-with-tools.bpmn'), ('py', 'Python', 'var(--s1)', 'py2', 'build.py')]
code_tabs, code_panes = [], []
for k, name, color, run, fname in CODE:
    path = os.path.join(os.path.dirname(P), 'exp2', 'runs', run, fname)
    text = open(path).read()
    n = sum(1 for l in text.split('\n') if l.strip())
    code_tabs.append(f'<button type="button" class="cbtn{" on" if k == "cli" else ""}" style="--c:{color}" data-pane="c-{k}" aria-pressed="{"true" if k == "cli" else "false"}">{name}</button>')
    code_panes.append(f'<div class="cpane" id="c-{k}"{"" if k == "cli" else " hidden"}><div class="chead">{run} / {fname} &middot; {n} lines</div><pre tabindex="0"><code>{_html.escape(text)}</code></pre></div>')
repl = {
    '{{TIME_AUTO}}': rnd(gm('auto', 'active_s'), 0), '{{TIME_HAND}}': rnd(gm('hand', 'active_s'), 0),
    '{{A_TIME_H}}': rnd(GAIN['active_s']['hand'], 0), '{{A_TIME_P}}': rnd(GAIN['active_s']['py'], 0),
    '{{A_TOK_H}}': rnd(GAIN['cost']['hand'], 0), '{{A_TOK_P}}': rnd(GAIN['cost']['py'], 0),
    '{{A_CALLS_H}}': rnd(GAIN['tool_uses']['hand'], 0),
    '{{LINES_AUTO}}': rnd(gm('auto', 'lines'), 0), '{{LINES_HAND}}': rnd(gm('hand', 'lines'), 0), '{{L_H}}': rnd(GAIN['lines']['hand'], 0), '{{L_P}}': rnd(GAIN['lines']['py'], 0),
    '{{CLO_AUTO}}': rnd(CLO['auto']), '{{CLO_HAND}}': rnd(CLO['hand']), '{{AUTO_LAYOUT}}': rnd(gm('auto', 'layout', True)),
    '{{THINK_PY}}': think['py'], '{{THINK_CLI}}': think['cli'], '{{THINK_HAND}}': think['hand'],
    '{{CREATE_PY}}': create['py'], '{{CREATE_CLI}}': create['cli'], '{{CREATE_HAND}}': create['hand'],
    '{{SUITE_LO}}': SUITE_LO, '{{SUITE_HI}}': SUITE_HI,
    '{{COST_AUTO}}': rnd(gm('auto', 'cost'), 2), '{{COST_HAND}}': rnd(gm('hand', 'cost'), 2), '{{ALL_CLO}}': rnd(ALL['closeness']), '{{ALL_TIME}}': rnd(ALL['active_s'], 0), '{{ALL_TOK}}': '$' + rnd(ALL['cost'], 2),
}
print(repl)

html = open(os.path.join(P, 'report_template26.html')).read()
for k_, v_ in repl.items():
    html = html.replace(k_, v_)
html = (html.replace('{{CHARTS}}', '\n'.join(f'<figure class="chart"><figcaption>{t}</figcaption>{s}</figure>' for t, s in charts))
        .replace('{{GALLERY_BUTTONS}}', gallery_buttons).replace('{{GALLERY_LEGEND}}', gallery_legend)
        .replace('{{GALLERY_IMGS}}', gallery_imgs).replace('{{GALLERY_BLUEPRINT}}', gallery_blueprint)
        .replace('{{PHASE_LEGEND}}', legend()).replace('{{PHASE_METHOD}}', method_chart()).replace('{{PHASE_TIMELINE}}', timeline_chart())
        .replace('{{PHASE_ROWS}}', '\n'.join(phase_rows)).replace('{{VS_ROWS}}', '\n'.join(vs_rows)).replace('{{APPENDIX_ROWS}}', '\n'.join(appendix_rows)).replace('{{CODE_TABS}}', '\n'.join(code_tabs)).replace('{{CODE_PANES}}', '\n'.join(code_panes)).replace('{{TOKEN_ROWS}}', '\n'.join(token_means + token_rows))
        .replace('{{CAT_HEADS}}', ''.join(f'<th class="num">{CAT_LABEL[k]}</th>' for k in CAT_KEYS)))
html = re.sub(r'hand([12])\b', r'skill\1', html)
open(sys.argv[1], 'w').write(html)
print('wrote', sys.argv[1], len(html), 'bytes')
