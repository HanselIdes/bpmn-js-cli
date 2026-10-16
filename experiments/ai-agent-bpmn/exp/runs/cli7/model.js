cli.definitions({ 'modeler:executionPlatformVersion': '8.10.0' });
cli.set('Process_1', { id: 'ai-agent-chat-with-tools', name: 'AI Agent Chat With Tools', isExecutable: true });
cli.set('StartEvent_1', { id: 'StartEvent_TaskReceived', name: 'Task to perform received' });
cli.zeebe('StartEvent_TaskReceived', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-initial-request' });

const gw = cli.append('StartEvent_TaskReceived', 'bpmn:ExclusiveGateway', '150,0', 'Flow_Start');
cli.set(gw, { id: 'Gateway_RunAgent' });
let agent = cli.append('Gateway_RunAgent', 'bpmn:SubProcess', '450,0', 'Flow_ToAgent');
agent = cli.replace(agent, 'bpmn:AdHocSubProcess', { isExpanded: true });
cli.set(agent, { id: 'AI_Agent', name: 'AI Agent' });
cli.resize('AI_Agent', { width: 520, height: 330 });
const ut = cli.append('AI_Agent', 'bpmn:UserTask', '500,0', 'Flow_ToFeedback');
cli.set(ut, { id: 'UserTask_ReviewAgentResponse', name: 'User Feedback' });
const gw2 = cli.append('UserTask_ReviewAgentResponse', 'bpmn:ExclusiveGateway', '170,0', 'Flow_ToSatisfied');
cli.set(gw2, { id: 'Gateway_UserSatisfied', name: 'User satisfied?' });
const end = cli.append('Gateway_UserSatisfied', 'bpmn:EndEvent', '170,0', 'Flow_Yes');
cli.set(end, { id: 'EndEvent_UserSatisfied', name: 'User satisfied' });
cli.set('Flow_Yes', { name: 'Yes' });
cli.condition('Flow_Yes', '=userSatisfied');
cli.connect('Gateway_UserSatisfied', 'Gateway_RunAgent', 'bpmn:SequenceFlow', '-', 'Flow_No');
cli.set('Flow_No', { name: 'No' });
cli.condition('Flow_No', '=userSatisfied = null or userSatisfied = false');

cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:UserTask');
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-user-feedback' });
cli.input('UserTask_ReviewAgentResponse', 'responseText', '=agent.responseText');

const sysPrompt = '="You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\n\nIf tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don\'t guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you\'re not able to find a good answer, return with a message stating why you\'re not able to."';
cli.template('AI_Agent', 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2', {
  'provider.type': 'openai',
  'provider.openai.api.type': 'responses',
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
  'retryBackoff': 'PT0S',
});

const tools = [
  ['LookupSampleUsers', 'Find sample users', 20, 40, 'https://jsonplaceholder.typicode.com/users',
   '={\n  toolCallResult: for user in response.body return {\n    id: user.id,\n    name: user.name,\n    username: user.username\n  }\n}',
   'Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.'],
  ['SearchRecipes', 'Search recipes', 20, 170, 'https://dummyjson.com/recipes/search',
   '={\n  toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found."\n}',
   'Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."'],
  ['FetchSafeJoke', 'Get a safe joke', 270, 40, 'https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode',
   '={\n  toolCallResult: response.body\n}',
   'Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.'],
  ['ListSampleTechnologyProducts', 'List sample technology products', 270, 170, 'https://api.restful-api.dev/objects',
   '={\n  toolCallResult: response.body\n}',
   'Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.'],
];
const b = cli.element('AI_Agent');
for (const [id, name, dx, dy, url, res, docu] of tools) {
  const x = b.x + dx + 50, y = b.y + dy + 40;
  const t = cli.create('bpmn:ServiceTask', x + ',' + y, 'AI_Agent');
  cli.set(t, { id, name });
  const vals = { url, resultExpression: res, retryBackoff: 'PT0S' };
  if (id === 'SearchRecipes') vals.queryParameters = '={\n  q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).")\n}';
  cli.template(id, 'io.camunda.connectors.HttpJson.v2', vals, { version: 18 });
  cli.doc(id, docu);
}
cli.move('StartEvent_TaskReceived', '0,65');
cli.move('Gateway_RunAgent', '0,65');
cli.waypoints('Flow_No', [[1520, 210], [1520, 400], [320, 400], [320, 210]]);
cli.annotate('StartEvent_TaskReceived', 'Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.', { width: 220, height: 90, dy: -107 });
cli.annotate('AI_Agent', 'This is your agent running certain tasks to reach the goal it was given', { width: 140, height: 60, dx: -380, dy: 110 });
cli.annotate('FetchSafeJoke', "Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it's good for based on its documentation.", { width: 240, height: 90, dx: 340, dy: 245, parent: 'ai-agent-chat-with-tools' });
