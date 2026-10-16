var out = [];
function kids(id) { return cli.elements().filter(function(e) { return String(e).indexOf('Event') === 0 || true; }).length; }
var a = cli.create('bpmn:SubProcess', { x: 500, y: 200 }, 'Process_1');
a = cli.replace(a, 'bpmn:AdHocSubProcess', { isExpanded: true });
var ch = cli.element(a).children.map(function(c) { return c.type; });
throw new Error('PROBE create+replace children=' + JSON.stringify(ch));
