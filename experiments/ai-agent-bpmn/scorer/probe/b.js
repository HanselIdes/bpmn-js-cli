var out = [];
function st(label, id) { var e = cli.element(id); out.push(label + ':' + e.type + ' expanded=' + (e.di && e.di.isExpanded) + ' collapsed=' + e.collapsed + ' w=' + e.width); }
var sp = cli.append('StartEvent_1', 'bpmn:SubProcess'); st('append', sp);
sp = cli.replace(sp, 'bpmn:AdHocSubProcess', { isExpanded: true }); st('replace', sp);
sp = cli.template(sp, 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2'); st('template', sp);
throw new Error('PROBE ' + out.join(' | '));
