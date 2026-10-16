import {
  AnnotateCommand,
  ConditionCommand,
  DefaultFlowCommand,
  DefinitionsCommand,
  DescribeCommand,
  DocCommand,
  HeaderCommand,
  InputCommand,
  OutputCommand,
  PropertyCommand,
  ReplaceCommand,
  ResizeCommand,
  SetCommand,
  TemplateCommand,
  TemplatePropsCommand,
  WaypointsCommand,
  ZeebeCommand
} from './commands';


/**
 * Registers Camunda 8 (Zeebe) modeling commands on the cli.
 *
 * Requires the zeebe moddle extension. Template commands additionally
 * require the CloudElementTemplatesCoreModule from bpmn-js-element-templates.
 *
 * @param {Cli} cli
 * @param {didi.Injector} injector
 */
export function CamundaCliInitializer(cli, injector) {
  cli._registerCommand('set', SetCommand);
  cli._registerCommand('definitions', DefinitionsCommand);
  cli._registerCommand('zeebe', ZeebeCommand);
  cli._registerCommand('input', InputCommand);
  cli._registerCommand('output', OutputCommand);
  cli._registerCommand('header', HeaderCommand);
  cli._registerCommand('property', PropertyCommand);
  cli._registerCommand('condition', ConditionCommand);
  cli._registerCommand('defaultFlow', DefaultFlowCommand);
  cli._registerCommand('doc', DocCommand);
  cli._registerCommand('replace', ReplaceCommand);
  cli._registerCommand('resize', ResizeCommand);
  cli._registerCommand('waypoints', WaypointsCommand);
  cli._registerCommand('annotate', AnnotateCommand);
  cli._registerCommand('describe', DescribeCommand);

  if (injector.get('elementTemplates', false)) {
    cli._registerCommand('template', TemplateCommand);
    cli._registerCommand('templateProps', TemplatePropsCommand);
  }
}

CamundaCliInitializer.$inject = [ 'cli', 'injector' ];

export default {
  __init__: [ 'camundaCliInitializer' ],
  camundaCliInitializer: [ 'type', CamundaCliInitializer ]
};
