"""Closeness of a candidate BPMN to the canonical one, scored 0-100.

Usage: python3 -I closeness.py <canonical.bpmn> <candidate.bpmn> [--json]

Each category is an F1 score over a set of "facts" extracted from both files,
so missing facts (recall) and invented extras (precision) both cost points.

  Structure      25  flow nodes (id, type, name, parent) + sequence flows (source, target, name)
  Configuration  50  zeebe extensions per element, condition expressions, documentation,
                     template binding (modelerTemplate + version). Icons and colors ignored.
  Annotations    10  text annotation texts + associations (source, target, by element/text)
  Layout         15  DI completeness (5) + position similarity of shared shapes (10)

FEEL and text values are compared after whitespace normalisation, so line breaks and
indentation inside an expression do not matter, but any token change does. A FEEL
number or boolean literal equals its static form ('=20' == '20'), because the canonical
file mixes both for the same setting and a plain-language spec cannot distinguish them.
"""
import json, math, re, sys
import xml.etree.ElementTree as ET

B = '{http://www.omg.org/spec/BPMN/20100524/MODEL}'
Z = '{http://camunda.org/schema/zeebe/1.0}'
BDI = '{http://www.omg.org/spec/BPMN/20100524/DI}'
DC = '{http://www.omg.org/spec/DD/20100524/DC}'
SKIP = {'sequenceFlow', 'extensionElements', 'incoming', 'outgoing', 'documentation',
        'textAnnotation', 'association', 'conditionExpression', 'text',
        'multiInstanceLoopCharacteristics', 'laneSet'}


def norm(s):
    s = re.sub(r'\s+', '', s or '')
    # a FEEL literal equals its static form: '=20' == '20', '=false' == 'false'
    if re.fullmatch(r'=(-?\d+(\.\d+)?|true|false)', s):
        s = s[1:]
    return s


def local(tag):
    return tag.split('}')[1]


def facts(path):
    root = ET.parse(path).getroot()
    proc = root.find(B + 'process')
    structure, config, annot = set(), set(), set()
    texts = {}

    def walk(container, parent):
        for e in container:
            t = local(e.tag)
            if t == 'sequenceFlow':
                structure.add(('flow', e.get('sourceRef'), e.get('targetRef'), (e.get('name') or '').strip()))
                c = e.find(B + 'conditionExpression')
                if c is not None:
                    config.add(('cond', e.get('sourceRef'), e.get('targetRef'), norm(c.text)))
                continue
            if t == 'textAnnotation':
                texts[e.get('id')] = norm(e.findtext(B + 'text'))
                annot.add(('text', norm(e.findtext(B + 'text'))))
                continue
            if t == 'association':
                continue
            if t in SKIP:
                continue
            eid = e.get('id')
            structure.add(('node', eid, t, (e.get('name') or '').strip(), parent))
            for a in ('modelerTemplate', 'modelerTemplateVersion'):
                if e.get(Z + a):
                    config.add(('tpl', eid, a, e.get(Z + a)))
            doc = e.find(B + 'documentation')
            if doc is not None and (doc.text or '').strip():
                config.add(('doc', eid, norm(doc.text)))
            if e.get('cancelActivity') == 'false':
                config.add(('attr', eid, 'cancelActivity', 'false'))
            ext = e.find(B + 'extensionElements')
            if ext is not None:
                for x in ext:
                    xt = local(x.tag)
                    if xt == 'ioMapping':
                        for io in x:
                            config.add((local(io.tag), eid, io.get('target'), norm(io.get('source'))))
                    elif xt == 'taskHeaders':
                        for h in x:
                            config.add(('header', eid, h.get('key'), norm(h.get('value'))))
                    elif xt == 'properties':
                        for p in x:
                            config.add(('property', eid, p.get('name'), norm(p.get('value'))))
                    else:
                        attrs = tuple(sorted((k, norm(v)) for k, v in x.attrib.items()))
                        config.add((xt, eid, attrs))
            for ed in e:
                if local(ed.tag).endswith('EventDefinition'):
                    config.add(('eventdef', eid, local(ed.tag)))
            if t in ('subProcess', 'adHocSubProcess'):
                walk(e, eid)

    walk(proc, proc.get('id'))
    for a in proc.findall(B + 'association'):
        s, t = a.get('sourceRef'), a.get('targetRef')
        s = 'T:' + texts[s] if s in texts else s
        t = 'T:' + texts[t] if t in texts else t
        annot.add(('assoc',) + tuple(sorted([s, t])))
    for k in ('id', 'name', 'isExecutable'):
        structure.add(('process', k, proc.get(k)))
    config.add(('platform', root.get('{http://camunda.org/schema/modeler/1.0}executionPlatform'),
                root.get('{http://camunda.org/schema/modeler/1.0}executionPlatformVersion')))

    shapes = {}
    for s in root.iter(BDI + 'BPMNShape'):
        b = s.find(DC + 'Bounds')
        shapes[s.get('bpmnElement')] = tuple(float(b.get(k)) for k in ('x', 'y', 'width', 'height'))
    edges = {e.get('bpmnElement') for e in root.iter(BDI + 'BPMNEdge')}
    ids = {e.get('id') for e in proc.iter() if e.get('id')}
    return dict(structure=structure, config=config, annot=annot, shapes=shapes, edges=edges,
                ids=ids, proc=proc)


def f1(ref, cand):
    if not ref and not cand:
        return 1.0, 0, 0
    tp = len(ref & cand)
    p = tp / len(cand) if cand else 0
    r = tp / len(ref) if ref else 0
    return (2 * p * r / (p + r) if p + r else 0.0), len(ref - cand), len(cand - ref)


def layout(ref, cand):
    proc = cand['proc']
    need_shapes = {e.get('id') for e in proc.iter()
                   if e.get('id') and local(e.tag) not in ('sequenceFlow', 'association', 'process')
                   and local(e.tag) not in ('incoming', 'outgoing')
                   and e.tag.startswith(B) and local(e.tag) not in ('documentation', 'extensionElements', 'conditionExpression', 'text')}
    need_edges = {e.get('id') for e in proc.iter() if local(e.tag) in ('sequenceFlow', 'association')}
    have = len(need_shapes & set(cand['shapes'])) + len(need_edges & cand['edges'])
    total = len(need_shapes) + len(need_edges)
    completeness = have / total if total else 0
    # position similarity: align on the start event centre (or bbox origin), compare centres of shared ids
    shared = [i for i in ref['shapes'] if i in cand['shapes']]

    def centre(b):
        return (b[0] + b[2] / 2, b[1] + b[3] / 2)

    def origin(sh, ids):
        xs = [sh[i][0] for i in ids]; ys = [sh[i][1] for i in ids]
        return (min(xs), min(ys)) if xs else (0, 0)
    if not shared:
        return completeness, 0.0, None
    ro, co = origin(ref['shapes'], shared), origin(cand['shapes'], shared)
    d = []
    for i in shared:
        rc, cc = centre(ref['shapes'][i]), centre(cand['shapes'][i])
        d.append(math.hypot((rc[0] - ro[0]) - (cc[0] - co[0]), (rc[1] - ro[1]) - (cc[1] - co[1])))
    mean = sum(d) / len(d)
    coverage = len(shared) / len(ref['shapes'])
    position = max(0.0, 1 - mean / 300) * coverage   # 0 px off = 1.0, >=300 px mean = 0
    return completeness, position, mean


def score(canon, cand_path):
    ref, cand = facts(canon), facts(cand_path)
    out = {}
    s, miss_s, extra_s = f1(ref['structure'], cand['structure'])
    c, miss_c, extra_c = f1(ref['config'], cand['config'])
    a, miss_a, extra_a = f1(ref['annot'], cand['annot'])
    comp, pos, mean = layout(ref, cand)
    out['structure'] = round(25 * s, 1)
    out['configuration'] = round(50 * c, 1)
    out['annotations'] = round(10 * a, 1)
    out['layout'] = round(5 * comp + 10 * pos, 1)
    out['total'] = round(out['structure'] + out['configuration'] + out['annotations'] + out['layout'], 1)
    out['detail'] = dict(
        structure_missing=miss_s, structure_extra=extra_s,
        config_missing=miss_c, config_extra=extra_c,
        annot_missing=miss_a, annot_extra=extra_a,
        di_completeness=round(comp, 3), mean_shape_offset_px=None if mean is None else round(mean, 1),
        missing_config=sorted(map(str, ref['config'] - cand['config']))[:40],
        extra_config=sorted(map(str, cand['config'] - ref['config']))[:40],
        missing_structure=sorted(map(str, ref['structure'] - cand['structure'])),
        extra_structure=sorted(map(str, cand['structure'] - ref['structure'])),
    )
    return out


if __name__ == '__main__':
    r = score(sys.argv[1], sys.argv[2])
    if '--json' in sys.argv:
        print(json.dumps(r, indent=2))
    else:
        d = r.pop('detail')
        print('CLOSENESS', r)
        for k in ('missing_structure', 'extra_structure', 'missing_config', 'extra_config'):
            for v in d[k]:
                print(' ', k, v[:200])
        print(' ', {k: v for k, v in d.items() if not isinstance(v, list)})
