cli.definitions({ 'modeler:executionPlatform': 'Camunda Cloud', 'modeler:executionPlatformVersion': '8.10.0' });
cli.set('Process_1', { id: 'ai-agent-chat-with-tools', name: 'AI Agent Chat With Tools', isExecutable: true });

cli.set('StartEvent_1', { id: 'StartEvent_TaskReceived', name: 'Task to perform received' });
cli.zeebe('StartEvent_TaskReceived', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-initial-request' });

var gw1 = cli.append('StartEvent_TaskReceived', 'bpmn:ExclusiveGateway', '100,0');
cli.set(gw1, { id: 'Gateway_RunAgent' });

var sp = cli.append('Gateway_RunAgent', 'bpmn:SubProcess', '300,0');
sp = cli.replace(sp, 'bpmn:AdHocSubProcess', { isExpanded: true });
cli.set(sp, { id: 'AI_Agent' });
cli.resize('AI_Agent', { x: 390, y: -50, width: 480, height: 340 });

var sys = '="You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\n\nIf tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don\'t guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you\'re not able to find a good answer, return with a message stating why you\'re not able to."';

cli.template('AI_Agent', 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2', {
  'provider.type': 'openai',
  'provider.openai.api.type': 'responses',
  'provider.openai.backend.type': 'custom',
  'provider.openai.backend.custom.endpoint': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_ENDPOINT',
  'provider.openai.backend.custom.authentication.type': 'apiKey',
  'provider.openai.backend.custom.authentication.apiKey': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_KEY',
  'provider.openai.model.model': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_DEFAULT_MODEL',
  'data.systemPrompt.prompt': sys,
  'data.userPrompt.prompt': '=if is defined(followUpInput) then followUpInput else inputText',
  'data.userPrompt.documents': '=if is defined(followUpInput) or is defined(followUpDocuments) then followUpDocuments else inputDocuments',
  'agentContext': '=agent.context',
  'data.memory.storage.type': 'in-process',
  'data.memory.contextWindowSize': '20',
  'data.limits.maxModelCalls': '10',
  'data.events.behavior': 'WAIT_FOR_TOOL_CALL_RESULTS',
  'data.response.format.type': 'text',
  'data.response.format.parseJson': 'false',
  'data.response.includeAssistantMessage': 'false',
  'data.response.includeAgentContext': 'true',
  'resultVariable': 'agent',
  'retryCount': '3',
  'retryBackoff': 'PT0S'
});

var ut = cli.append('AI_Agent', 'bpmn:UserTask', '350,0');
cli.set(ut, { id: 'UserTask_ReviewAgentResponse', name: 'User Feedback' });
cli.replace('UserTask_ReviewAgentResponse', 'bpmn:UserTask');
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:UserTask');
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-user-feedback' });
cli.input('UserTask_ReviewAgentResponse', 'responseText', '=agent.responseText');

var gw2 = cli.append('UserTask_ReviewAgentResponse', 'bpmn:ExclusiveGateway', '120,0');
cli.set(gw2, { id: 'Gateway_UserSatisfied', name: 'User satisfied?' });
var end = cli.append('Gateway_UserSatisfied', 'bpmn:EndEvent', '120,0');
cli.set(end, { id: 'EndEvent_UserSatisfied', name: 'User satisfied' });

var flowIds = cli.elements().filter(function(e) { return /^Flow_/.test(e.id || e); }).map(function(e) { return e.id || e; });
cli.set(flowIds[3], { id: 'Flow_ReviewToGateway' });
cli.set(flowIds[4], { id: 'Flow_Yes', name: 'Yes' });
cli.condition('Flow_Yes', '=userSatisfied');

var no = cli.connect('Gateway_UserSatisfied', 'Gateway_RunAgent', 'bpmn:SequenceFlow');
cli.set(no, { id: 'Flow_No', name: 'No' });
cli.condition('Flow_No', '=userSatisfied = null or userSatisfied = false');
cli.waypoints('Flow_No', [[1100, 145], [1100, 340], [270, 340], [270, 145]]);

var HTTP = 'io.camunda.connectors.HttpJson.v2';
function tool(id, name, pos, doc, values) {
  var t = cli.create('bpmn:ServiceTask', pos, 'AI_Agent');
  cli.set(t, { id: id, name: name });
  var base = { 'method': 'GET', 'connectionTimeoutInSeconds': '20', 'readTimeoutInSeconds': '20', 'retryCount': '3', 'retryBackoff': 'PT0S' };
  Object.keys(values).forEach(function(k) { base[k] = values[k]; });
  cli.template(id, HTTP, base);
  cli.doc(id, doc);
}

tool('LookupSampleUsers', 'Find sample users', '500,80',
  'Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.',
  { 'url': 'https://jsonplaceholder.typicode.com/users',
    'resultExpression': '={\n  toolCallResult: for user in response.body return {\n    id: user.id,\n    name: user.name,\n    username: user.username\n  }\n}' });

tool('SearchRecipes', 'Search recipes', '500,200',
  'Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."',
  { 'url': 'https://dummyjson.com/recipes/search',
    'queryParameters': '={\n  q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).")\n}',
    'resultExpression': '={\n  toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found."\n}' });

tool('FetchSafeJoke', 'Get a safe joke', '760,80',
  'Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.',
  { 'url': 'https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode',
    'resultExpression': '={\n  toolCallResult: response.body\n}' });

tool('ListSampleTechnologyProducts', 'List sample technology products', '760,200',
  'Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.',
  { 'url': 'https://api.restful-api.dev/objects',
    'resultExpression': '={\n  toolCallResult: response.body\n}' });

cli.annotate('StartEvent_TaskReceived', 'Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.', { id: 'TextAnnotation_Start', associationId: 'Association_Start', dx: 60, dy: -110, width: 260, height: 90 });
cli.annotate('AI_Agent', 'This is your agent running certain tasks to reach the goal it was given', { id: 'TextAnnotation_Agent', associationId: 'Association_Agent', dx: -405, dy: 270, width: 250, height: 50 });
cli.annotate('FetchSafeJoke', 'Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it\'s good for based on its documentation.', { id: 'TextAnnotation_Tools', associationId: 'Association_Tools', dx: 235, dy: 230, width: 190, height: 110, parent: 'ai-agent-chat-with-tools' });
