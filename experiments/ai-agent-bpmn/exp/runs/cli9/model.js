cli.set('Process_1', { id: 'ai-agent-chat-with-tools', name: 'AI Agent Chat With Tools', isExecutable: true });
cli.definitions({ 'modeler:executionPlatform': 'Camunda Cloud', 'modeler:executionPlatformVersion': '8.10.0' });
cli.set('StartEvent_1', { id: 'StartEvent_TaskReceived', name: 'Task to perform received' });
cli.zeebe('StartEvent_TaskReceived', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-initial-request' });
var gw = cli.append('StartEvent_TaskReceived', 'bpmn:ExclusiveGateway', '150,0', 'Flow_Start');
cli.set(gw, { id: 'Gateway_RunAgent' });
var sp = cli.append('Gateway_RunAgent', 'bpmn:SubProcess', '200,0', 'Flow_ToAgent');
var ag = cli.replace(sp, 'bpmn:AdHocSubProcess', { isExpanded: true });
cli.set(ag, { id: 'AI_Agent', name: 'AI Agent' });
var ut = cli.append('AI_Agent', 'bpmn:UserTask', '300,0', 'Flow_ToFeedback');
cli.set(ut, { id: 'UserTask_ReviewAgentResponse', name: 'User Feedback' });
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:UserTask', {});
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-user-feedback' });
cli.input('UserTask_ReviewAgentResponse', 'responseText', '=agent.responseText');
var g2 = cli.append('UserTask_ReviewAgentResponse', 'bpmn:ExclusiveGateway', '200,0', 'Flow_ToSatisfied');
cli.set(g2, { id: 'Gateway_UserSatisfied', name: 'User satisfied?' });
var en = cli.append('Gateway_UserSatisfied', 'bpmn:EndEvent', '200,0', 'Flow_Yes');
cli.set(en, { id: 'EndEvent_UserSatisfied', name: 'User satisfied' });
cli.connect('Gateway_UserSatisfied', 'Gateway_RunAgent', 'bpmn:SequenceFlow', '-', 'Flow_No');
cli.set('Flow_Yes', { name: 'Yes' });
cli.set('Flow_No', { name: 'No' });
cli.condition('Flow_Yes', '=userSatisfied');
cli.condition('Flow_No', '=userSatisfied = null or userSatisfied = false');

var sys = '="You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\\n\\nIf tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don\'t guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you\'re not able to find a good answer, return with a message stating why you\'re not able to."';
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
  'data.response.includeAgentContext': true,
  'data.response.includeAssistantMessage': false,
  'data.response.format.parseJson': false,
  'retryBackoff': 'PT0S'
});

var tools = [
  ['LookupSampleUsers', 'Find sample users', 'https://jsonplaceholder.typicode.com/users',
   '={\n  toolCallResult: for user in response.body return {\n    id: user.id,\n    name: user.name,\n    username: user.username\n  }\n}',
   'Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.'],
  ['SearchRecipes', 'Search recipes', 'https://dummyjson.com/recipes/search',
   '={\n  toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found."\n}',
   'Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."'],
  ['FetchSafeJoke', 'Get a safe joke', 'https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode',
   '={\n  toolCallResult: response.body\n}',
   'Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.'],
  ['ListSampleTechnologyProducts', 'List sample technology products', 'https://api.restful-api.dev/objects',
   '={\n  toolCallResult: response.body\n}',
   'Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.']
];
tools.forEach(function (t, i) {
  var id = cli.create('bpmn:ServiceTask', '300,' + (200 + i * 100), 'AI_Agent');
  cli.set(id, { id: t[0], name: t[1] });
  var vals = { url: t[2], resultExpression: t[3], retryBackoff: 'PT0S' };
  if (t[0] === 'SearchRecipes') vals.queryParameters = '={\n  q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).", "string")\n}';
  cli.template(t[0], 'io.camunda.connectors.HttpJson.v2', vals);
  cli.doc(t[0], t[4]);
});

cli.afterLayout(function () {
  var a = cli.element('AI_Agent');
  var ax = a.x, ay = a.y;
  var pos = { LookupSampleUsers: [0, 0], SearchRecipes: [0, 1], FetchSafeJoke: [1, 0], ListSampleTechnologyProducts: [1, 1] };
  Object.keys(pos).forEach(function (k) {
    var e = cli.element(k);
    var tx = ax + 40 + pos[k][0] * 160, ty = ay + 40 + pos[k][1] * 110;
    cli.move(k, (tx - e.x) + ',' + (ty - e.y));
  });
  cli.annotate('StartEvent_TaskReceived', 'Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.', { width: 300, height: 90, dy: -130 });
  cli.annotate('AI_Agent', 'This is your agent running certain tasks to reach the goal it was given', { width: 200, height: 60, dx: -300, dy: 0 });
  cli.annotate('FetchSafeJoke', 'Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it\'s good for based on its documentation.', { width: 250, height: 90, dx: 250, dy: 150 });
});
