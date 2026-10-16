// Acceptance: build the full spec with the extended cli only.
cli.definitions({ 'modeler:executionPlatformVersion': '8.10.0' });
cli.set('Process_1', { id: 'ai-agent-chat-with-tools', name: 'AI Agent Chat With Tools' });

var start = cli.set('StartEvent_1', { id: 'StartEvent_TaskReceived', name: 'Task to perform received' });
cli.zeebe(start, 'zeebe:FormDefinition', { formId: 'ai-agent-chat-initial-request' });
cli.move(start, { x: 70, y: 140 });

var gwRun = cli.append(start, 'bpmn:ExclusiveGateway', { x: 82, y: 0 });
cli.set(gwRun, { id: 'Gateway_RunAgent' });

var agent = cli.append('Gateway_RunAgent', 'bpmn:SubProcess', { x: 240, y: 0 });
agent = cli.replace(agent, 'bpmn:AdHocSubProcess', { isExpanded: true });
cli.set(agent, { id: 'AI_Agent', name: 'AI Agent' });
agent = cli.template('AI_Agent', 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2', {
  'provider.type': 'openai',
  'provider.openai.api.type': 'responses',
  'provider.openai.backend.type': 'custom',
  'provider.openai.backend.custom.endpoint': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_ENDPOINT',
  'provider.openai.backend.custom.authentication.type': 'apiKey',
  'provider.openai.backend.custom.authentication.apiKey': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_KEY',
  'provider.openai.model.model': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_DEFAULT_MODEL',
  'data.systemPrompt.prompt': '="You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\n\nIf tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don\'t guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you\'re not able to find a good answer, return with a message stating why you\'re not able to."',
  'data.userPrompt.prompt': '=if (is defined(followUpInput)) then followUpInput else inputText',
  'data.userPrompt.documents': '=if (is defined(followUpInput) or is defined(followUpDocuments)) then followUpDocuments else inputDocuments',
  'agentContext': '=agent.context',
  'data.memory.storage.type': 'in-process',
  'data.memory.contextWindowSize': 20,
  'data.limits.maxModelCalls': 10,
  'data.events.behavior': 'WAIT_FOR_TOOL_CALL_RESULTS',
  'data.response.format.type': 'text',
  'data.response.format.parseJson': false,
  'data.response.includeAssistantMessage': false,
  'data.response.includeAgentContext': true,
  'retryBackoff': 'PT0S'
});
cli.resize('AI_Agent', { width: 311, height: 300 });

var http = { 'authentication.type': 'noAuth', method: 'GET', connectionTimeoutInSeconds: '20', readTimeoutInSeconds: '20', retryBackoff: 'PT0S' };
function tool(id, name, x, y, values, doc) {
  var t = cli.create('bpmn:ServiceTask', { x: x, y: y }, 'AI_Agent');
  t = cli.template(t, 'io.camunda.connectors.HttpJson.v2', Object.assign({}, http, values));
  cli.set(t, { id: id, name: name });
  cli.doc(id, doc);
  cli.input(id, 'ignoreNullValues', '=false');
  return id;
}
var a = cli.element('AI_Agent');
tool('LookupSampleUsers', 'Find sample users', a.x + 80, a.y + 110, {
  url: 'https://jsonplaceholder.typicode.com/users',
  resultExpression: '={\n  toolCallResult: for user in response.body return {\n    id: user.id,\n    name: user.name,\n    username: user.username\n  }\n}'
}, 'Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.');
tool('SearchRecipes', 'Search recipes', a.x + 80, a.y + 210, {
  url: 'https://dummyjson.com/recipes/search',
  queryParameters: '={\n  q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).")\n}',
  resultExpression: '={\n  toolCallResult: if (count(response.body.recipes) > 0) then response.body.recipes else "No result found."\n}'
}, 'Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."');
tool('FetchSafeJoke', 'Get a safe joke', a.x + 221, a.y + 110, {
  url: 'https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode',
  resultExpression: '={\n  toolCallResult: response.body\n}'
}, 'Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.');
tool('ListSampleTechnologyProducts', 'List sample technology products', a.x + 221, a.y + 210, {
  url: 'https://api.restful-api.dev/objects',
  resultExpression: '={toolCallResult: response.body}'
}, 'Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.');

var ut = cli.append('AI_Agent', 'bpmn:UserTask', { x: 260, y: -110 });
cli.set(ut, { id: 'UserTask_ReviewAgentResponse', name: 'User Feedback' });
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:UserTask');
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-user-feedback' });
cli.input('UserTask_ReviewAgentResponse', 'responseText', '=agent.responseText');

var gwSat = cli.append('UserTask_ReviewAgentResponse', 'bpmn:ExclusiveGateway', { x: 120, y: 0 });
cli.set(gwSat, { id: 'Gateway_UserSatisfied', name: 'User satisfied?' });
var end = cli.append('Gateway_UserSatisfied', 'bpmn:EndEvent', { x: 130, y: 0 });
cli.set(end, { id: 'EndEvent_UserSatisfied', name: 'User satisfied' });

function flowBetween(s, t) {
  return cli.element(s).outgoing.filter(function(c) { return c.target.id === t; })[0].id;
}
cli.set(flowBetween('StartEvent_TaskReceived', 'Gateway_RunAgent'), { id: 'Flow_TaskReceived_ToAgentGateway' });
cli.set(flowBetween('Gateway_RunAgent', 'AI_Agent'), { id: 'Flow_Retry_ToAgent' });
cli.set(flowBetween('AI_Agent', 'UserTask_ReviewAgentResponse'), { id: 'Flow_Agent_ToFeedback' });
cli.set(flowBetween('UserTask_ReviewAgentResponse', 'Gateway_UserSatisfied'), { id: 'Flow_Feedback_ToDecision' });
cli.set(flowBetween('Gateway_UserSatisfied', 'EndEvent_UserSatisfied'), { id: 'Flow_UserSatisfied_End', name: 'Yes' });
cli.condition('Flow_UserSatisfied_End', '=userSatisfied');
var back = cli.connect('Gateway_UserSatisfied', 'Gateway_RunAgent', 'bpmn:SequenceFlow');
cli.set(back, { id: 'Flow_UserRejected_Retry', name: 'No' });
cli.condition('Flow_UserRejected_Retry', '=userSatisfied = null or userSatisfied = false');

cli.annotate('StartEvent_TaskReceived', 'Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.', { id: 'TextAnnotation_tools_intro', associationId: 'Association_tools_intro', dx: -90, dy: -160, width: 290, height: 70 });
cli.annotate('AI_Agent', 'This is your agent running certain tasks to reach the goal it was given', { id: 'Annotation_AgentSummary', associationId: 'Association_AgentSummary', dx: -265, dy: 140, width: 100, height: 84 });
cli.annotate('FetchSafeJoke', 'Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it\'s good for based on its documentation.', { id: 'Annotation_ToolCapabilities', associationId: 'Association_ToolCapabilities', parent: 'ai-agent-chat-with-tools', reverse: true, dx: 245, dy: 98, width: 190, height: 82 });
