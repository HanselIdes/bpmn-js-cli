cli.definitions({ 'modeler:executionPlatformVersion': '8.10.0' });
cli.set('Process_1', { id: 'ai-agent-chat-with-tools', name: 'AI Agent Chat With Tools', isExecutable: true });
cli.set('StartEvent_1', { id: 'StartEvent_TaskReceived', name: 'Task to perform received' });
cli.zeebe('StartEvent_TaskReceived', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-initial-request' });
var gw = cli.append('StartEvent_TaskReceived', 'bpmn:ExclusiveGateway', '150,0', 'Flow_Start');
cli.set(gw, { id: 'Gateway_RunAgent' });
var ag = cli.append('Gateway_RunAgent', 'bpmn:AdHocSubProcess', '200,0', 'Flow_ToAgent');
ag = cli.replace(ag, 'bpmn:AdHocSubProcess', { isExpanded: true });
cli.set(ag, { id: 'AI_Agent', name: 'AI Agent' });
var sysPrompt = '="You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\n\nIf tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don\'t guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you\'re not able to find a good answer, return with a message stating why you\'re not able to."';
cli.template('AI_Agent', 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2', {
  'provider.type': 'openai',
  'provider.openai.backend.type': 'custom',
  'provider.openai.backend.custom.endpoint': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_ENDPOINT',
  'provider.openai.backend.custom.authentication.type': 'apiKey',
  'provider.openai.backend.custom.authentication.apiKey': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_KEY',
  'provider.openai.model.model': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_DEFAULT_MODEL',
  'data.systemPrompt.prompt': sysPrompt,
  'data.userPrompt.prompt': '=if (is defined(followUpInput)) then followUpInput else inputText',
  'data.userPrompt.documents': '=if (is defined(followUpInput) or is defined(followUpDocuments)) then followUpDocuments else inputDocuments',
  'agentContext': '=agent.context',
  'data.response.format.parseJson': false,
  'data.response.includeAssistantMessage': false,
  'data.response.includeAgentContext': true,
  'retryBackoff': 'PT0S'
}, {});
var ut = cli.append('AI_Agent', 'bpmn:UserTask', '250,0', 'Flow_ToFeedback');
cli.set(ut, { id: 'UserTask_ReviewAgentResponse', name: 'User Feedback' });
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:UserTask', {});
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-user-feedback' });
cli.input('UserTask_ReviewAgentResponse', 'responseText', '=agent.responseText');
var g2 = cli.append('UserTask_ReviewAgentResponse', 'bpmn:ExclusiveGateway', '150,0', 'Flow_ToSatisfied');
cli.set(g2, { id: 'Gateway_UserSatisfied', name: 'User satisfied?' });
var en = cli.append('Gateway_UserSatisfied', 'bpmn:EndEvent', '150,0', 'Flow_Yes');
cli.set(en, { id: 'EndEvent_UserSatisfied', name: 'User satisfied' });
cli.set('Flow_Yes', { name: 'Yes' });
cli.condition('Flow_Yes', '=userSatisfied');
cli.connect('Gateway_UserSatisfied', 'Gateway_RunAgent', 'bpmn:SequenceFlow', '-', 'Flow_No');
cli.set('Flow_No', { name: 'No' });
cli.condition('Flow_No', '=userSatisfied = null or userSatisfied = false');

var T = 'io.camunda.connectors.HttpJson.v2';
function tool(id, name, url, resExpr, docText, extra) {
  var t = cli.create('bpmn:ServiceTask', '0,0', 'AI_Agent');
  cli.set(t, { id: id, name: name });
  var vals = { url: url, resultExpression: resExpr, retryBackoff: 'PT0S' };
  for (var k in (extra || {})) vals[k] = extra[k];
  cli.template(id, T, vals, {});
  cli.doc(id, docText);
}
tool('LookupSampleUsers', 'Find sample users', 'https://jsonplaceholder.typicode.com/users',
  '={\n  toolCallResult: for user in response.body return {\n    id: user.id,\n    name: user.name,\n    username: user.username\n  }\n}',
  'Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.');
tool('SearchRecipes', 'Search recipes', 'https://dummyjson.com/recipes/search',
  '={\n  toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found."\n}',
  'Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."',
  { queryParameters: '={\n  q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).")\n}' });
tool('FetchSafeJoke', 'Get a safe joke', 'https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode',
  '={\n  toolCallResult: response.body\n}',
  'Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.');
tool('ListSampleTechnologyProducts', 'List sample technology products', 'https://api.restful-api.dev/objects',
  '={\n  toolCallResult: response.body\n}',
  'Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.');

cli.annotate('StartEvent_TaskReceived', 'Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.', { width: 200, height: 100 });
cli.annotate('AI_Agent', 'This is your agent running certain tasks to reach the goal it was given', { width: 200, height: 60 });
cli.annotate('FetchSafeJoke', 'Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it\'s good for based on its documentation.', { width: 200, height: 100 });
