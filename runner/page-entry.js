import Modeler from 'bpmn-js/lib/Modeler';
import zeebeModdle from 'zeebe-bpmn-moddle/resources/zeebe.json';
import ZeebeBehaviorsModule from 'camunda-bpmn-js-behaviors/lib/camunda-cloud';
import { CloudElementTemplatesCoreModule } from 'bpmn-js-element-templates/core';

import CliModule from '../index';
import CamundaCliModule from '../lib/camunda';

function emptyDiagram(engine) {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Cloud" modeler:executionPlatformVersion="' + engine + '">' +
    '<bpmn:process id="Process_1" isExecutable="true"><bpmn:startEvent id="StartEvent_1" /></bpmn:process>' +
    '<bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">' +
    '<bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="152" y="102" width="36" height="36" /></bpmndi:BPMNShape>' +
    '</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>';
}

window.bootCli = async function(options) {
  const modeler = new Modeler({
    container: document.getElementById('canvas'),
    additionalModules: [
      CliModule,
      CamundaCliModule,
      ZeebeBehaviorsModule,
      CloudElementTemplatesCoreModule
    ],
    moddleExtensions: { zeebe: zeebeModdle },
    elementTemplates: options.templates || [],
    elementTemplatesEngines: { camunda: options.engine },
    cli: { bindTo: 'cli' }
  });

  // engines config key differs across versions; set explicitly as well
  const elementTemplates = modeler.get('elementTemplates');
  if (elementTemplates.setEngines) {
    elementTemplates.setEngines({ camunda: options.engine });
  }
  elementTemplates.set(options.templates || []);

  window.modeler = modeler;

  const { warnings } = await modeler.importXML(options.xml || emptyDiagram(options.engine));

  return warnings.map(w => w.message);
};
