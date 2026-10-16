var a = cli.append('StartEvent_1', 'bpmn:Task');
a = cli.replace(a, 'bpmn:AdHocSubProcess', { isExpanded: true });
var c = cli.element(a).children.map(function(x) { return x.type; });
throw new Error('PROBE task->adhoc children=' + JSON.stringify(c));
