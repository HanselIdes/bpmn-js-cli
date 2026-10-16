const P = 'ai-agent-chat-with-tools';
cli.set('Process_1', { id: P, name: 'AI Agent Chat With Tools', isExecutable: true });
cli.definitions({ 'modeler:executionPlatform': 'Camunda Cloud', 'modeler:executionPlatformVersion': '8.10.0' });

// start
cli.set('StartEvent_1', { id: 'StartEvent_TaskReceived', name: 'Task to perform received' });
cli.zeebe('StartEvent_TaskReceived', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-initial-request' });
cli.move('StartEvent_TaskReceived', { x: 30, y: 180 });

const gw1 = cli.create('bpmn:ExclusiveGateway', { x: 320, y: 300 }, P);
cli.set(gw1, { id: 'Gateway_RunAgent' });

let agent = cli.create('bpmn:SubProcess', { x: 670, y: 300 }, P);
agent = cli.replace(agent, 'bpmn:AdHocSubProcess', { isExpanded: true });
cli.resize(agent, { x: 420, y: 120, width: 500, height: 360 });

const sys = 'You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\n\nIf tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don\'t guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you\'re not able to find a good answer, return with a message stating why you\'re not able to.';
agent = cli.template(agent, 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2', {
  'provider.type': 'openai',
  'provider.openai.api.type': 'responses',
  'provider.openai.backend.type': 'custom',
  'provider.openai.backend.custom.endpoint': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_ENDPOINT',
  'provider.openai.backend.custom.authentication.type': 'apiKey',
  'provider.openai.backend.custom.authentication.apiKey': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_KEY',
  'provider.openai.model.model': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_DEFAULT_MODEL',
  'data.systemPrompt.prompt': '="' + sys.replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"',
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
cli.set(agent, { id: 'AI_Agent', name: 'AI Agent' });
agent = 'AI_Agent';

const http = {
  method: 'GET', 'authentication.type': 'noAuth',
  connectionTimeoutInSeconds: '20', readTimeoutInSeconds: '20',
  retryCount: '3', retryBackoff: 'PT0S'
};
const tools = [
  ['LookupSampleUsers', 'Find sample users', 550, 240, 'https://jsonplaceholder.typicode.com/users',
   '={ toolCallResult: for user in response.body return { id: user.id, name: user.name, username: user.username } }', null,
   'Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.'],
  ['SearchRecipes', 'Search recipes', 550, 360, 'https://dummyjson.com/recipes/search',
   '={ toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found." }',
   '={ q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).") }',
   'Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."'],
  ['FetchSafeJoke', 'Get a safe joke', 790, 240, 'https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode',
   '={ toolCallResult: response.body }', null,
   'Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.'],
  ['ListSampleTechnologyProducts', 'List sample technology products', 790, 360, 'https://api.restful-api.dev/objects',
   '={ toolCallResult: response.body }', null,
   'Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.']
];
for (const [id, name, x, y, url, res, q, doc] of tools) {
  let t = cli.create('bpmn:ServiceTask', { x, y }, agent);
  const vals = Object.assign({}, http, { url, resultExpression: res });
  if (q) vals.queryParameters = q;
  t = cli.template(t, 'io.camunda.connectors.HttpJson.v2', vals);
  cli.set(t, { id, name });
  cli.doc(id, doc);
}

const ut = cli.create('bpmn:UserTask', { x: 1040, y: 300 }, P);
cli.set(ut, { id: 'UserTask_ReviewAgentResponse', name: 'User Feedback' });
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:UserTask');
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-user-feedback' });
cli.input('UserTask_ReviewAgentResponse', 'responseText', '=agent.responseText');

const gw2 = cli.create('bpmn:ExclusiveGateway', { x: 1040, y: 560 }, P);
cli.set(gw2, { id: 'Gateway_UserSatisfied', name: 'User satisfied?' });
const end = cli.create('bpmn:EndEvent', { x: 1160, y: 560 }, P);
cli.set(end, { id: 'EndEvent_UserSatisfied', name: 'User satisfied' });

const f = (s, t, id, name) => {
  const c = cli.connect(s, t, 'bpmn:SequenceFlow');
  cli.set(c, name ? { id, name } : { id });
  return c;
};
f('StartEvent_TaskReceived', 'Gateway_RunAgent', 'Flow_StartToGateway');
f('Gateway_RunAgent', 'AI_Agent', 'Flow_GatewayToAgent');
f('AI_Agent', 'UserTask_ReviewAgentResponse', 'Flow_AgentToUser');
f('UserTask_ReviewAgentResponse', 'Gateway_UserSatisfied', 'Flow_UserToGateway');
f('Gateway_UserSatisfied', 'EndEvent_UserSatisfied', 'Flow_Yes', 'Yes');
cli.condition('Flow_Yes', '=userSatisfied');
f('Gateway_UserSatisfied', 'Gateway_RunAgent', 'Flow_No', 'No');
cli.condition('Flow_No', '=userSatisfied = null or userSatisfied = false');

cli.annotate('StartEvent_TaskReceived', 'Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.',
  { id: 'TextAnnotation_Start', associationId: 'Association_Start' });
cli.resize('TextAnnotation_Start', { x: 120, y: 60, width: 280, height: 90 });
cli.annotate('AI_Agent', 'This is your agent running certain tasks to reach the goal it was given',
  { id: 'TextAnnotation_Agent', associationId: 'Association_Agent' });
cli.resize('TextAnnotation_Agent', { x: 280, y: 190, width: 130, height: 70 });
cli.annotate('FetchSafeJoke', 'Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it\'s good for based on its documentation.',
  { id: 'TextAnnotation_Tools', associationId: 'Association_Tools', parent: P });
cli.resize('TextAnnotation_Tools', { x: 1090, y: 380, width: 220, height: 100 });
