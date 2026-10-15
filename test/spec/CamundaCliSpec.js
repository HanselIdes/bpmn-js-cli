import { expect } from 'chai';

import {
  bootstrapModeler,
  inject
} from '../TestHelper';

import zeebeModdle from 'zeebe-bpmn-moddle/resources/zeebe.json';
import ZeebeBehaviorsModule from 'camunda-bpmn-js-behaviors/lib/camunda-cloud';
import { CloudElementTemplatesCoreModule } from 'bpmn-js-element-templates/core';

import cliModule from '../../';
import camundaCliModule from '../../lib/camunda';

import testTemplate from '../fixtures/test-template.json';


function extension(element, type) {
  var extensionElements = element.businessObject.get('extensionElements');

  return extensionElements && extensionElements.get('values').filter(function(value) {
    return value.$type === type;
  })[0];
}

function inputs(element) {
  var ioMapping = extension(element, 'zeebe:IoMapping');

  return (ioMapping ? ioMapping.get('inputParameters') : []).reduce(function(map, input) {
    map[input.target] = input.source;

    return map;
  }, {});
}


describe('camunda commands', function() {

  var startDiagramXML = require('resources/start.bpmn');

  beforeEach(bootstrapModeler(startDiagramXML, {
    additionalModules: [
      cliModule,
      camundaCliModule,
      ZeebeBehaviorsModule,
      CloudElementTemplatesCoreModule
    ],
    moddleExtensions: {
      zeebe: zeebeModdle
    },
    cli: {
      bindTo: 'cli'
    }
  }));

  beforeEach(inject(function(elementTemplates) {
    elementTemplates.set([ testTemplate ]);
  }));


  describe('raw arguments', function() {

    it('should keep whitespace in non-final string arguments', inject(function(cli) {

      // given
      var task = cli.append('StartEvent_1', 'bpmn:ServiceTask');

      // when
      cli.header(task, 'result expression', '={ a: 1 }');

      // then
      var header = extension(cli.element(task), 'zeebe:TaskHeaders').get('values')[0];
      expect(header.key).to.equal('result expression');
      expect(header.value).to.equal('={ a: 1 }');
    }));


    it('should still split upstream commands', inject(function(cli) {

      // when
      var task = cli.append('StartEvent_1', 'bpmn:UserTask 150,0');

      // then
      expect(cli.element(task).type).to.equal('bpmn:UserTask');
    }));

  });


  describe('set', function() {

    it('should rename a sequence flow', inject(function(cli) {

      // given
      var task = cli.append('StartEvent_1', 'bpmn:Task');
      var flow = cli.element(task).incoming[0].id;

      // when
      cli.set(flow, { id: 'Flow_Start_ToTask', name: 'Go' });

      // then
      var renamed = cli.element('Flow_Start_ToTask');
      expect(renamed.businessObject.name).to.equal('Go');
    }));

  });


  describe('zeebe extensions', function() {

    it('should add an extension once and update attributes', inject(function(cli) {

      // given
      var task = cli.append('StartEvent_1', 'bpmn:UserTask');

      // when
      cli.zeebe(task, 'zeebe:FormDefinition', { formId: 'a' });
      cli.zeebe(task, 'zeebe:FormDefinition', { formId: 'b' });

      // then
      var values = cli.element(task).businessObject.extensionElements.get('values')
        .filter(function(v) { return v.$type === 'zeebe:FormDefinition'; });

      expect(values).to.have.length(1);
      expect(values[0].formId).to.equal('b');
    }));


    it('should upsert inputs, outputs, headers, properties', inject(function(cli) {

      // given
      var task = cli.append('StartEvent_1', 'bpmn:ServiceTask');

      // when
      cli.input(task, 'responseText', '=agent.responseText');
      cli.input(task, 'responseText', '=agent.other');
      cli.output(task, 'agent', '=agent');
      cli.header(task, 'retryBackoff', 'PT0S');
      cli.property(task, 'io.camunda.agenticai.toolContainer', 'true');

      // then
      var element = cli.element(task);
      expect(inputs(element)).to.eql({ responseText: '=agent.other' });
      expect(extension(element, 'zeebe:IoMapping').get('outputParameters')[0].source).to.equal('=agent');
      expect(extension(element, 'zeebe:TaskHeaders').get('values')[0].value).to.equal('PT0S');
      expect(extension(element, 'zeebe:Properties').get('properties')[0].value).to.equal('true');
    }));

  });


  describe('flows', function() {

    it('should set condition and default flow', inject(function(cli) {

      // given
      var gateway = cli.append('StartEvent_1', 'bpmn:ExclusiveGateway');
      var a = cli.append(gateway, 'bpmn:Task', '150,0');
      var b = cli.append(gateway, 'bpmn:Task', '150,120');
      var flowA = cli.element(a).incoming[0].id;
      var flowB = cli.element(b).incoming[0].id;

      // when
      cli.condition(flowA, '=amount > 1000');
      cli.defaultFlow(gateway, flowB);

      // then
      expect(cli.describe(flowA).condition).to.equal('=amount > 1000');
      expect(cli.describe(gateway).default).to.equal(flowB);
    }));


    it('should reject a condition on a shape', inject(function(cli) {
      expect(function() {
        cli.condition('StartEvent_1', '=true');
      }).to.throw(/not a sequence flow/);
    }));

  });


  describe('shapes', function() {

    it('should replace with an expanded ad-hoc sub-process and resize it', inject(function(cli) {

      // given
      var sub = cli.append('StartEvent_1', 'bpmn:SubProcess');

      // when
      sub = cli.replace(sub, 'bpmn:AdHocSubProcess', { isExpanded: true });
      cli.resize(sub, { width: 311, height: 300 });

      // then
      var element = cli.element(sub);
      expect(element.type).to.equal('bpmn:AdHocSubProcess');
      expect(element.width).to.equal(311);
      expect(element.height).to.equal(300);
    }));


    it('should document an element', inject(function(cli) {

      // when
      cli.doc('StartEvent_1', 'Lists available users.');

      // then
      expect(cli.describe('StartEvent_1').documentation).to.equal('Lists available users.');
    }));


    it('should annotate with an association in a chosen parent', inject(function(cli, canvas) {

      // given
      var root = canvas.getRootElement();

      // when
      var annotation = cli.annotate('StartEvent_1', 'Some words here', {
        id: 'Annotation_1',
        associationId: 'Association_1',
        parent: root.id,
        reverse: true
      });

      // then
      var association = cli.element('Association_1');
      expect(annotation).to.equal('Annotation_1');
      expect(association.source.id).to.equal('Annotation_1');
      expect(association.target.id).to.equal('StartEvent_1');
      expect(cli.element('Annotation_1').businessObject.text).to.equal('Some words here');
    }));

  });


  describe('definitions', function() {

    it('should set a prefixed attribute', inject(function(cli, canvas) {

      // when
      cli.definitions({ 'modeler:executionPlatformVersion': '8.10.0' });

      // then
      var definitions = canvas.getRootElement().businessObject.$parent;
      expect(definitions.get('modeler:executionPlatformVersion')).to.equal('8.10.0');
    }));


    it('should reject an unprefixed unknown attribute', inject(function(cli) {
      expect(function() {
        cli.definitions({ executionPlatformVersion: '8.10.0' });
      }).to.throw(/modeler:executionPlatformVersion/);
    }));

  });


  describe('templates', function() {

    it('should list template properties', inject(function(cli) {

      // when
      var props = cli.templateProps('test.connector');

      // then
      expect(props.properties.map(function(p) { return p.id; })).to.eql([
        'mode', 'bOnly', 'timeout', 'resultExpression'
      ]);
    }));


    it('should apply a template and write values exactly as given', inject(function(cli) {

      // given
      var task = cli.append('StartEvent_1', 'bpmn:Task');

      // when
      task = cli.template(task, 'test.connector', {
        timeout: '20',
        resultExpression: '={ toolCallResult: response.body }'
      });

      // then
      var element = cli.element(task);
      expect(element.type).to.equal('bpmn:ServiceTask');
      expect(extension(element, 'zeebe:TaskDefinition').type).to.equal('test:job');
      expect(inputs(element).timeout).to.equal('20');
      expect(extension(element, 'zeebe:TaskHeaders').get('values')[0].value).to.equal('={ toolCallResult: response.body }');
    }));


    it('should set a conditional property revealed by another value', inject(function(cli) {

      // given
      var task = cli.append('StartEvent_1', 'bpmn:Task');

      // when
      task = cli.template(task, 'test.connector', { bOnly: 'x', mode: 'b' });

      // then
      expect(inputs(cli.element(task))).to.include({ mode: 'b', bOnly: 'x' });
    }));


    it('should reject a value whose condition is not met', inject(function(cli) {

      // given
      var task = cli.append('StartEvent_1', 'bpmn:Task');

      // then
      expect(function() {
        cli.template(task, 'test.connector', { bOnly: 'x' });
      }).to.throw(/conditions are not met: bOnly/);
    }));


    it('should reject an unknown property id', inject(function(cli) {

      // given
      var task = cli.append('StartEvent_1', 'bpmn:Task');

      // then
      expect(function() {
        cli.template(task, 'test.connector', { nope: 'x' });
      }).to.throw(/no properties with id: nope/);
    }));

  });

});
