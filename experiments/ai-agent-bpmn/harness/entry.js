import Modeler from 'bpmn-js/lib/Modeler';
import CliModule from 'bpmn-js-cli';
import zeebeModdle from 'zeebe-bpmn-moddle/resources/zeebe.json';

// Opt-in custom command for arm B2: set business properties via modeling.
// props(elementId, json) where json is {attrs:{...}, zeebe:[{type:'zeebe:TaskDefinition', type_:'x', retries:'3'}], condition:'=x', default:'FlowId', timer:{kind:'timeDuration', value:'=\"PT2D\"'}, cancelActivity:false}
function PropsCommand(params, modeling, moddle, elementRegistry, bpmnFactory) {
  return {
    args: [ params.shape('element'), params.string('json') ],
    exec: function(element, json) {
      var spec = JSON.parse(json);
      var bo = element.businessObject;
      if (spec.attrs) modeling.updateProperties(element, spec.attrs);
      if (spec.default) modeling.updateProperties(element, { default: elementRegistry.get(spec.default).businessObject });
      if (spec.condition) modeling.updateProperties(element, { conditionExpression: moddle.create('bpmn:FormalExpression', { body: spec.condition }) });
      if (spec.zeebe) {
        var ext = bo.extensionElements || moddle.create('bpmn:ExtensionElements', { values: [] });
        spec.zeebe.forEach(function(z) {
          var t = z.$type; var attrs = Object.assign({}, z); delete attrs.$type;
          var children = attrs.children; delete attrs.children;
          var el = moddle.create(t, attrs);
          if (children) Object.keys(children).forEach(function(k) { el.set(k, children[k].map(function(c) { var ct=c.$type; var a=Object.assign({},c); delete a.$type; return moddle.create(ct,a); })); });
          ext.get('values').push(el);
        });
        modeling.updateProperties(element, { extensionElements: ext });
      }
      if (spec.timer) {
        var ed = bo.eventDefinitions && bo.eventDefinitions[0];
        ed.set(spec.timer.kind, moddle.create('bpmn:FormalExpression', { body: spec.timer.value }));
      }
      if (spec.cancelActivity === false) modeling.updateProperties(element, { cancelActivity: false });
      return element.id;
    }
  };
}
PropsCommand.$inject = [ 'cli._params', 'modeling', 'moddle', 'elementRegistry', 'bpmnFactory' ];

// replace(elementId, type, eventDefinitionType?) for event definitions (e.g. timer boundary) via bpmnReplace
function ReplaceCommand(params, bpmnReplace) {
  return {
    args: [ params.shape('element'), params.string('type'), params.string('eventDefinitionType', { defaultValue: '' }) ],
    exec: function(element, type, edt) {
      var target = { type: type }; if (edt) target.eventDefinitionType = edt;
      return bpmnReplace.replaceElement(element, target).id;
    }
  };
}
ReplaceCommand.$inject = [ 'cli._params', 'bpmnReplace' ];

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Cloud" modeler:executionPlatformVersion="8.8.0"><bpmn:process id="Process_1" isExecutable="true"><bpmn:startEvent id="StartEvent_1" /></bpmn:process><bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1"><bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="152" y="102" width="36" height="36" /></bpmndi:BPMNShape></bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>';

window.boot = async function(mode, xml) {
  const modeler = new Modeler({
    container: document.getElementById('canvas'),
    additionalModules: [ CliModule ],
    moddleExtensions: { zeebe: zeebeModdle },
    cli: { bindTo: 'cli' }
  });
  window.modeler = modeler;
  await modeler.importXML(xml || EMPTY);
  if (mode === 'extended') {
    cli._registerCommand('props', PropsCommand);
    cli._registerCommand('replace', ReplaceCommand);
  }
  modeler.get('canvas').zoom('fit-viewport');
  return true;
};
