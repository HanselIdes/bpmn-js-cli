const P = 'ai-agent-chat-with-tools';
cli.definitions({ 'modeler:executionPlatform': 'Camunda Cloud', 'modeler:executionPlatformVersion': '8.10.0' });
cli.set('Process_1', { id: P, name: 'AI Agent Chat With Tools', isExecutable: true });

cli.set('StartEvent_1', { id: 'StartEvent_TaskReceived', name: 'Task to perform received' });
cli.zeebe('StartEvent_TaskReceived', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-initial-request' });

const gw = cli.append('StartEvent_TaskReceived', 'bpmn:ExclusiveGateway', '110,0', 'Flow_Start');
cli.set(gw, { id: 'Gateway_RunAgent' });

let ag = cli.append('Gateway_RunAgent', 'bpmn:Task', '320,0', 'Flow_ToAgent');
ag = cli.replace(ag, 'bpmn:AdHocSubProcess', { isExpanded: true });
cli.set(ag, { id: 'AI_Agent', name: 'AI Agent' });
for (const e of cli.elements()) { if (String(e).startsWith('Event_')) cli.removeShape(e); }
cli.resize('AI_Agent', { x: 360, y: -20, width: 420, height: 280 });

const secret = n => '=camunda.secrets.' + n;
const sys = '="You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\\n\\nIf tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don\'t guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you\'re not able to find a good answer, return with a message stating why you\'re not able to."';
cli.template('AI_Agent', 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2', {
  'provider.type': 'openai',
  'provider.openai.api.type': 'responses',
  'provider.openai.backend.type': 'custom',
  'provider.openai.backend.custom.endpoint': secret('CAMUNDA_PROVIDED_LLM_API_ENDPOINT'),
  'provider.openai.backend.custom.authentication.type': 'apiKey',
  'provider.openai.backend.custom.authentication.apiKey': secret('CAMUNDA_PROVIDED_LLM_API_KEY'),
  'provider.openai.model.model': secret('CAMUNDA_PROVIDED_LLM_DEFAULT_MODEL'),
  'data.systemPrompt.prompt': sys,
  'data.userPrompt.prompt': '=if (is defined(followUpInput)) then followUpInput else inputText',
  'data.userPrompt.documents': '=if is defined(followUpInput) or is defined(followUpDocuments) then followUpDocuments else inputDocuments',
  'agentContext': '=agent.context',
  'data.memory.storage.type': 'in-process',
  'data.memory.contextWindowSize': '20',
  'data.limits.maxModelCalls': '10',
  'data.events.behavior': 'WAIT_FOR_TOOL_CALL_RESULTS',
  'data.response.format.type': 'text',
  'data.response.format.parseJson': false,
  'data.response.includeAssistantMessage': false,
  'data.response.includeAgentContext': true,
  'resultVariable': 'agent',
  'retryCount': '3',
  'retryBackoff': 'PT0S'
});

const tools = [
  { id: 'LookupSampleUsers', name: 'Find sample users', pos: '470,60',
    url: 'https://jsonplaceholder.typicode.com/users',
    res: '={\n  toolCallResult: for user in response.body return {\n    id: user.id,\n    name: user.name,\n    username: user.username\n  }\n}',
    doc: 'Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.' },
  { id: 'SearchRecipes', name: 'Search recipes', pos: '470,180',
    url: 'https://dummyjson.com/recipes/search',
    qp: '={\n  q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).")\n}',
    res: '={\n  toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found."\n}',
    doc: 'Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."' },
  { id: 'FetchSafeJoke', name: 'Get a safe joke', pos: '670,60',
    url: 'https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode',
    res: '={\n  toolCallResult: response.body\n}',
    doc: 'Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.' },
  { id: 'ListSampleTechnologyProducts', name: 'List sample technology products', pos: '670,180',
    url: 'https://api.restful-api.dev/objects',
    res: '={\n  toolCallResult: response.body\n}',
    doc: 'Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.' }
];
for (const t of tools) {
  let id = cli.create('bpmn:ServiceTask', t.pos, 'AI_Agent');
  id = (id && id.id) || id;
  cli.set(id, { id: t.id, name: t.name });
  cli.template(t.id, 'io.camunda.connectors.HttpJson.v2', {
    'authentication.type': 'noAuth',
    method: 'GET',
    url: t.url,
    ...(t.qp ? { queryParameters: t.qp } : {}),
    connectionTimeoutInSeconds: '20',
    readTimeoutInSeconds: '20',
    resultExpression: t.res,
    retryCount: '3',
    retryBackoff: 'PT0S'
  });
  cli.doc(t.id, t.doc);
}

const ut = cli.append('AI_Agent', 'bpmn:UserTask', '320,0', 'Flow_AgentToUser');
cli.set(ut, { id: 'UserTask_ReviewAgentResponse', name: 'User Feedback' });
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:UserTask', {});
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-user-feedback' });
cli.input('UserTask_ReviewAgentResponse', 'responseText', '=agent.responseText');

const g2 = cli.append('UserTask_ReviewAgentResponse', 'bpmn:ExclusiveGateway', '130,0', 'Flow_UserToGateway');
cli.set(g2, { id: 'Gateway_UserSatisfied', name: 'User satisfied?' });
const en = cli.append('Gateway_UserSatisfied', 'bpmn:EndEvent', '120,0', 'Flow_Yes');
cli.set(en, { id: 'EndEvent_UserSatisfied', name: 'User satisfied' });
cli.set('Flow_Yes', { name: 'Yes' });
cli.condition('Flow_Yes', '=userSatisfied');
cli.connect('Gateway_UserSatisfied', 'Gateway_RunAgent', 'bpmn:SequenceFlow', '-', 'Flow_No');
cli.set('Flow_No', { name: 'No' });
cli.waypoints('Flow_No', [[1020,145],[1020,320],[280,320],[280,145]]);
cli.condition('Flow_No', '=userSatisfied = null or userSatisfied = false');

cli.annotate('StartEvent_TaskReceived', 'Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.', { id: 'TextAnnotation_Start', associationId: 'Association_Start', width: 220, height: 110, dy: -170 });
cli.annotate('AI_Agent', 'This is your agent running certain tasks to reach the goal it was given', { id: 'TextAnnotation_Agent', associationId: 'Association_Agent', width: 200, height: 70, dx: -330, dy: 220 });
cli.annotate('FetchSafeJoke', 'Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it\'s good for based on its documentation.', { id: 'TextAnnotation_Tools', associationId: 'Association_Tools', width: 220, height: 90, dx: 230, dy: 170, parent: P });
