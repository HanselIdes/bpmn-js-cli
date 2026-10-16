var a = cli.append('StartEvent_1', 'bpmn:SubProcess');
a = cli.replace(a, 'bpmn:AdHocSubProcess', { isExpanded: true });
var ch = cli.element(a).children.map(function(c) { return c.type; });
throw new Error('PROBE append+replace children=' + JSON.stringify(ch));
