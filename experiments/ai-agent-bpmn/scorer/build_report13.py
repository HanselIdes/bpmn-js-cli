"""Build the results artifact from verified results.

Usage: python3 -I build_report.py <out.html>
"""
import base64, json, os, re, statistics, sys

P = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(P, 'results.v1.json'))) + json.load(open(os.path.join(P, 'results.v2.json'))) + json.load(open(os.path.join(P, 'results.v3.json'))) + json.load(open(os.path.join(P, 'results.v4.json'))) + json.load(open(os.path.join(P, 'results.v5.json'))) + json.load(open(os.path.join(P, 'results.v6.json')))
by = {r['run']: r for r in rows}

METHODS = [
    ('python', 'Python', ['py1', 'py2'], 'var(--s1)'),
    ('cli', 'Extended CLI', ['cli11', 'cli12'], 'var(--s2)'),
    ('hand', '/camunda-bpmn', ['hand1', 'hand2'], 'var(--s3)'),
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
        out.append(f'<text x="{x(max(vals)) + 12:.1f}" y="{cy + 4}" class="val">{fmt(m)}{unit}</text>')
    out.append('</svg>')
    return '\n'.join(out)


charts = [
    ('Closeness to canonical <span>0 to 100, higher is closer</span>', strip('closeness', 'Closeness', '', 82, 92, [82, 84, 86, 88, 90, 92], lambda v: f'{v:.1f}', 'higher is closer &rarr;')),
    ('Tokens per trial <span>fewer is cheaper</span>', strip('tokens', 'Tokens', '', 110000, 150000, [110000, 120000, 130000, 140000, 150000], fmt_k, 'fewer is cheaper &larr;')),
    ('Active time to done <span>seconds, CPT queue excluded</span>', strip('active_s', 'Active time', ' s', 90, 300, [90, 120, 150, 180, 210, 240, 270, 300], lambda v: f'{v:.0f}', 'seconds, CPT queue excluded')),
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

gallery_items = [('canonical', 'Canonical tutorial', 'var(--muted)', 'Canonical')] + [(r, r, color, name) for name, _, runs, color in [(m[1], m[0], m[2], m[3]) for m in METHODS] for r in runs]
gallery_buttons = '\n'.join(
    f'<button type="button" class="gbtn{" on" if i == 0 else ""}" style="--c:{color}" title="{name}" data-img="g-{k}" aria-pressed="{"true" if i == 0 else "false"}">{lab}</button>'
    for i, (k, lab, color, name) in enumerate(gallery_items))
gallery_legend = '<ul class="legend" aria-label="Method colours">' + ''.join(
    f'<li><span class="sw" style="background:{color}"></span>{name}</li>' for _, name, _, color in METHODS) + '</ul>'
gallery_imgs = '\n'.join(
    f'<img id="g-{k}" src="{img(k)}" alt="Rendered diagram: {lab}"{"" if i == 0 else " hidden"}>'
    for i, (k, lab, _c, _n) in enumerate(gallery_items))


# ---------- phase charts ----------
phases = json.load(open(os.path.join(P, 'phases.v6.json')))
CATS = [('thinking', 'Thinking', 'var(--ph-think)'), ('looking up', 'Looking up', 'var(--c1)'), ('creating', 'Creating', 'var(--c2)'),
        ('fixing', 'Fixing', 'var(--c3)'), ('executing', 'Executing', 'var(--c4)'), ('linting', 'Linting', 'var(--c5)'),
        ('test suite', 'Test suite', 'var(--c6)')]
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


def seg_rect(x, y, w, h, cat, secs, run=None):
    tip = f'{run + ": " if run else ""}{CAT_LABEL[cat]} {secs:.0f} s'
    return (f'<g class="seg" tabindex="0" data-tip="{tip}"><rect x="{x:.1f}" y="{y}" width="{max(w, 0.8):.1f}" height="{h}" '
            f'style="fill:{CAT_FILL[cat]}" class="segr"/></g>')


def legend():
    items = ''.join(f'<li><svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" rx="2" style="fill:{f}"/>'
                    f'<rect width="14" height="14" rx="2" class="swo"/></svg>{l}</li>' for k, l, f in CATS)
    return f'<ul class="legend" aria-label="Phase colours">{items}</ul>'


def method_chart():
    groups = [('Python', ['py1', 'py2']), ('Extended CLI', ['cli11', 'cli12']), ('/camunda-bpmn', ['hand1', 'hand2'])]
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
        out.append(f'<text x="{x(cur) + 8:.1f}" y="{cy + 25}" class="val">{cur:.0f} s</text>')
    out.append('</svg>')
    return '\n'.join(out)


def timeline_chart():
    order = [('Python', ['py1', 'py2']), ('Extended CLI', ['cli11', 'cli12']), ('/camunda-bpmn', ['hand1', 'hand2'])]
    W, L, R, ROW, GAP, TOP = 900, 170, 70, 24, 14, 6
    short = {'py': 'Python', 'cli': 'CLI', 'hand': 'Hand'}
    short_of = lambda r: 'CLI auto' if r in ('cli11', 'cli12') else short[r.rstrip('0123456789')]
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
            out.append(f'<text x="{x(cur) + 8:.1f}" y="{y + 16}" class="val">{cur:.0f} s</text>')
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
        fc, tot = first_check(r)
        phase_rows.append('<tr class="%s"><td>%s</td><td>%s</td>%s<td class="num">%.0f</td><td class="num">%.0f s (%.0f%%)</td></tr>' % (
            'muted-row' if key == 'cliv1' else '', r, name,
            ''.join(f'<td class="num">{t.get(k, 0):.0f}</td>' for k in CAT_KEYS),
            sum(t.values()), fc, 100 * fc / tot))

plateau_rows = []


# ---------- why the CLI took longer: per-run call mix ----------
sys.path.insert(0, P)
import callmix3 as CM
_ns = {'__name__': 'x'}
exec(open(os.path.join(P, 'calls3.py')).read().replace("if __name__=='__main__':", "if False:"), _ns)
_calls = _ns['calls']
RUNS8 = ['py1', 'py2', 'cli3', 'cli4', 'hand1', 'hand2', 'cli1', 'cli2']
RUNS10 = ['py1', 'py2', 'cli11', 'cli12', 'hand1', 'hand2']
MIX = {}
for r in RUNS10:
    mix = CM.call_mix(r)
    sp = CM.split(r)
    ms = _calls(r)
    MIX[r] = dict(total=sum(mix.values()), api=len(ms), per_call=sum(m['end'] - m['start'] for m in ms) / len(ms),
                  fork=mix['reads fork source/README'], lookups=mix['looks up template props'], filt=mix['filters template/props output'],
                  render=mix['views render'], writes=mix['writes the artifact'], reasoning=sp['reasoning'], composing=sp['composing a call'])
mix_rows = []
for key, name, runs, color in METHODS:
    for r in runs:
        d = MIX[r]
        mix_rows.append('<tr class="%s"><td>%s</td><td>%s</td><td class="num">%d</td><td class="num">%.1f</td><td class="num">%d</td><td class="num">%d</td><td class="num">%d</td><td class="num">%d</td><td class="num">%.0f</td><td class="num">%.0f</td></tr>' % (
            'muted-row' if key == 'cliv1' else '', r, name, d['total'], d['per_call'], d['fork'], d['lookups'] + d['filt'], d['render'], d['writes'], d['reasoning'], d['composing']))

# guards: every number quoted in the prose must match the data
tm = {g: {k: statistics.mean(norm_totals(r).get(k, 0) for r in runs) for k in CAT_KEYS} for g, runs in
      [('py', ['py1', 'py2']), ('cli', ['cli11', 'cli12']), ('hand', ['hand1', 'hand2'])]}
tot = lambda g: sum(tm[g][k] for k in CAT_KEYS)
assert [round(100 * tm[g]['thinking'] / tot(g)) for g in ('py', 'cli', 'hand')] == [35, 46, 50]
assert [round(tm[g]['creating']) for g in ('py', 'cli', 'hand')] == [60, 14, 41]
assert [round(tm[g]['thinking']) for g in ('py', 'cli', 'hand')] == [60, 64, 81]
assert [round(tot(g)) for g in ('py', 'cli', 'hand')] == [168, 138, 163]
fcs = {r: first_check(r) for r in RUNS10}
lo, hi = min(f for f, _ in fcs.values()), max(f for f, _ in fcs.values())
pc = [MIX[r]['per_call'] for r in RUNS10]
PC_LO, PC_HI = f'{min(pc):.1f}', f'{max(pc):.1f}'
print('per call', PC_LO, PC_HI)
print('first check range', round(lo), round(hi))
print('plateau rows:'); [print(' ', re.sub('<[^>]+>', ' ', r)) for r in plateau_rows]


# ---------- % change against the two baselines ----------
G = {'hand': ['hand1', 'hand2'], 'py': ['py1', 'py2'], 'auto': ['cli11', 'cli12']}
def gm(g, k, part=False):
    return statistics.mean((by[r]['parts'][k] if part else by[r][k]) for r in G[g])
METRICS = [('Tokens', 'tokens', False, True, lambda v: f'{v:,.0f}'), ('Active time', 'active_s', False, True, lambda v: f'{v:.0f} s'),
           ('Closeness (of 100)', 'closeness', False, False, lambda v: f'{v:.1f}'), ('Layout (of 15)', 'layout', True, False, lambda v: f'{v:.1f}')]
def gain(base, g, k, part, lower):
    b, v = gm(base, k, part), gm(g, k, part)
    return 100 * ((b - v) / b if lower else (v - b) / b)
def cell(x):
    cls = 'good' if x > 0.5 else 'bad' if x < -0.5 else 'flat'
    return f'<td class="num pct {cls}">{x:+.1f}%</td>'
def lines_written(run):
    d = os.path.join(os.path.dirname(P), 'exp2', 'runs', run)
    f = next((n for n in ('build.py', 'model.js') if os.path.exists(os.path.join(d, n))), 'ai-agent-chat-with-tools.bpmn')
    return sum(1 for l in open(os.path.join(d, f)) if l.strip())
LINES = {g: statistics.mean(lines_written(r) for r in G[g]) for g in G}
print('lines', LINES)
def runvals(g, k, part, fmt):
    return ' | '.join(f'{r} {fmt(by[r]["parts"][k] if part else by[r][k])}' for r in G[g])
def tcell(cls, text, tip):
    return f'<td class="{cls}" title="{tip}">{text}</td>'
def cell_t(x, tip):
    cls = 'good' if x > 0.5 else 'bad' if x < -0.5 else 'flat'
    return f'<td class="num pct {cls}" title="{tip}">{x:+.1f}%</td>'
vs_rows = []
for label, k, part, lower, fmt in METRICS:
    tip_auto = runvals('auto', k, part, fmt)
    vs_rows.append(f'<tr><td class="strong">{label}</td>' + tcell('num', fmt(gm("hand", k, part)), runvals('hand', k, part, fmt)) + tcell('num', fmt(gm("py", k, part)), runvals('py', k, part, fmt))
                   + ''.join(cell_t(gain(b, 'auto', k, part, lower), 'Extended CLI: ' + tip_auto) for b in ('hand', 'py')) + '</tr>')

def lines_written(run):
    d = os.path.join(os.path.dirname(P), 'exp2', 'runs', run)
    f = next((n for n in ('build.py', 'model.js') if os.path.exists(os.path.join(d, n))), 'ai-agent-chat-with-tools.bpmn')
    return sum(1 for l in open(os.path.join(d, f)) if l.strip())
LINES = {g: statistics.mean(lines_written(r) for r in G[g]) for g in G}
LINE_TIP = {g: ' | '.join(f'{r} {lines_written(r)}' for r in G[g]) for g in G}
lines_gain = lambda base, g: 100 * (LINES[base] - LINES[g]) / LINES[base]
vs_rows.append(f'<tr><td class="strong">Lines the agent writes</td>' + tcell('num', f'{LINES["hand"]:.0f} (XML)', LINE_TIP['hand']) + tcell('num', f'{LINES["py"]:.0f} (Python)', LINE_TIP['py'])
               + ''.join(cell_t(lines_gain(b, 'auto'), 'Extended CLI: ' + LINE_TIP['auto']) for b in ('hand', 'py')) + '</tr>')
A = {m_: {b: gain(b, 'auto', k, part, lower) for b in ('hand', 'py')} for m_, k, part, lower in [('tok', 'tokens', False, True), ('time', 'active_s', False, True), ('clo', 'closeness', False, False), ('lay', 'layout', True, False)]}
adj = (by['cli11']['active_s'] + by['cli12']['active_s'] - 50.3) / 2
adj_h = 100 * (gm('hand', 'active_s') - adj) / gm('hand', 'active_s')
adj_p = 100 * (gm('py', 'active_s') - adj) / gm('py', 'active_s')
repl = {'{{LINES_AUTO}}': f'{LINES["auto"]:.0f}', '{{LINES_HAND}}': f'{LINES["hand"]:.0f}', '{{CLO_AUTO}}': f'{gm("auto", "closeness"):.1f}', '{{CLO_HAND}}': f'{gm("hand", "closeness"):.1f}', '{{TIME_AUTO}}': f'{gm("auto", "active_s"):.0f}', '{{TIME_HAND}}': f'{gm("hand", "active_s"):.0f}', '{{L_H}}': f'{lines_gain("hand", "auto"):.0f}', '{{L_P}}': f'{lines_gain("py", "auto"):.0f}', '{{AUTO_LAYOUT}}': f'{gm("auto", "layout", True):.1f}', '{{A_LAY_P_EXACT}}': f'{A["lay"]["py"]:.0f}', '{{VS_ROWS}}': '\n'.join(vs_rows),
        '{{A_TIME_H}}': f'{A["time"]["hand"]:.0f}', '{{A_TIME_P}}': f'{A["time"]["py"]:.0f}',
        '{{A_TOK_H}}': f'{A["tok"]["hand"]:.0f}', '{{A_TOK_P}}': f'{A["tok"]["py"]:.0f}',
        '{{A_CLO_H}}': f'{A["clo"]["hand"]:+.1f}', '{{A_CLO_P}}': f'{A["clo"]["py"]:+.1f}',
        '{{A_LAY_P}}': f'{A["lay"]["py"]:+.0f}',         '{{ADJ_TIME}}': f'{adj:.0f}', '{{ADJ_H}}': f'{adj_h:.0f}', '{{ADJ_P}}': f'{adj_p:.0f}'}
print(repl)

html = open(os.path.join(P, 'report_template13.html')).read()
for k_, v_ in repl.items():
    html = html.replace(k_, v_)
html = (html.replace('{{CHARTS}}', '\n'.join(f'<figure class="chart"><figcaption>{t}</figcaption>{s}</figure>' for t, s in charts))
        .replace('{{TRIAL_ROWS}}', '\n'.join(trs))
        .replace('{{SUMMARY_ROWS}}', '\n'.join(summary_rows))
        .replace('{{GALLERY_BUTTONS}}', gallery_buttons).replace('{{GALLERY_LEGEND}}', gallery_legend)
        .replace('{{GALLERY_IMGS}}', gallery_imgs)
        .replace('{{MIX_ROWS}}', '\n'.join(mix_rows))
        .replace('{{PC_LO}}', PC_LO).replace('{{PC_HI}}', PC_HI).replace('{{FIRST_LO}}', str(round(lo))).replace('{{FIRST_HI}}', str(round(hi)))
        .replace('{{PHASE_LEGEND}}', legend()).replace('{{PHASE_METHOD}}', method_chart()).replace('{{PHASE_TIMELINE}}', timeline_chart())
        .replace('{{PHASE_ROWS}}', '\n'.join(phase_rows)).replace('{{PLATEAU_ROWS}}', '\n'.join(plateau_rows))
        .replace('{{CAT_HEADS}}', ''.join(f'<th class="num">{CAT_LABEL[k]}</th>' for k in CAT_KEYS)))
open(sys.argv[1], 'w').write(html)
print('wrote', sys.argv[1], len(html), 'bytes')
