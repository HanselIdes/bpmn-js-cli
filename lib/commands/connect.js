export default function ConnectCommand(params, modeling) {

  var parentParam = params.shape('parent', { optional: true });

  return {
    description: 'connect source to target; returns the id of the new connection',
    args: [
      params.shape('source'),
      params.shape('target'),
      params.string('type'),
      {
        name: 'parent',
        optional: true,
        parse: function(val) {
          return val === '-' ? null : parentParam.parse(val);
        }
      },
      {
        name: 'flowId',
        optional: true,
        parse: function(val) {
          return Array.isArray(val) ? val[0] : val;
        }
      }
    ],
    options: {
      type: 'BPMN type, e.g. bpmn:SequenceFlow',
      parent: 'parent element of the connection, default the source parent; - keeps the default',
      flowId: 'id for the new connection (pass parent too, or - for the default parent), so you need not look it up'
    },
    exec: function(source, target, type, parent, flowId) {
      var connection = modeling.createConnection(source, target, {
        type: type,
      }, parent || source.parent);

      if (flowId) {
        modeling.updateProperties(connection, { id: flowId });
      }

      return connection.id;
    }
  };
}

ConnectCommand.$inject = [ 'cli._params', 'modeling' ];
