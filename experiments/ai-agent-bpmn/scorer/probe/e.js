var a = cli.append('StartEvent_1', 'bpmn:SubProcess');
a = cli.replace(a, 'bpmn:AdHocSubProcess', { isExpanded: true });
var c1 = cli.element(a).children.map(function(c) { return c.type; });
a = cli.template(a, 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2');
var c2 = cli.element(a).children.map(function(c) { return c.type; });
cli.resize(a, { width: 311, height: 300 });
var c3 = cli.element(a).children.map(function(c) { return c.type; });
throw new Error('PROBE after replace=' + JSON.stringify(c1) + ' after template=' + JSON.stringify(c2) + ' after resize=' + JSON.stringify(c3));
