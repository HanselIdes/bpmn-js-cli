export default function AppendCommand(params, modeling) {

  return {
    description: 'append a new element after source, connected by a sequence flow; returns the new element id',
    args: [
      params.shape('source'),
      params.string('type'),
      params.point('delta', { defaultValue: { x: 200, y: 0 } }),
      {
        name: 'flowId',
        optional: true,
        parse: function(val) {
          return Array.isArray(val) ? val[0] : val;
        }
      }
    ],
    options: {
      type: 'BPMN type, e.g. bpmn:UserTask',
      delta: 'x,y offset from the source center, default 200,0',
      flowId: 'id for the sequence flow that is created (pass delta too), so you need not look it up'
    },
    exec: function(source, type, delta, flowId) {
      var newPosition = {
        x: source.x + source.width / 2 + delta.x,
        y: source.y + source.height / 2 + delta.y
      };

      var shape = modeling.appendShape(source, { type: type }, newPosition);

      if (flowId) {
        var flow = shape.incoming.filter(function(c) {
          return c.source === source;
        })[0];

        if (flow) {
          modeling.updateProperties(flow, { id: flowId });
        }
      }

      return shape.id;
    }
  };
}

AppendCommand.$inject = [ 'cli._params', 'modeling' ];
