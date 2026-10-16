const P = 'ai-agent-chat-with-tools';
cli.set('Process_1', { id: P, name: 'AI Agent Chat With Tools', isExecutable: true });
cli.definitions({ 'modeler:executionPlatform': 'Camunda Cloud', 'modeler:executionPlatformVersion': '8.10.0' });

const start = 'StartEvent_TaskReceived';
cli.set('StartEvent_1', { id: start, name: 'Task to perform received' });
cli.zeebe(start, 'zeebe:FormDefinition', { formId: 'ai-agent-chat-initial-request' });

let gw = cli.create('bpmn:ExclusiveGateway', { x: 330, y: 300 }, P);
cli.set(gw, { id: 'Gateway_RunAgent' }); gw = 'Gateway_RunAgent';

let ag = cli.create('bpmn:AdHocSubProcess', { x: 700, y: 300 }, P);
ag = cli.replace(ag, 'bpmn:AdHocSubProcess', { isExpanded: true });
cli.resize(ag, { width: 480, height: 380, x: 460, y: 110 });
const sec = n => '=camunda.secrets.' + n;
ag = cli.template(ag, 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2', {
  'provider.type': 'openai',
  'provider.openai.api.type': 'responses',
  'provider.openai.backend.type': 'custom',
  'provider.openai.backend.custom.endpoint': sec('CAMUNDA_PROVIDED_LLM_API_ENDPOINT'),
  'provider.openai.backend.custom.authentication.type': 'apiKey',
  'provider.openai.backend.custom.authentication.apiKey': sec('CAMUNDA_PROVIDED_LLM_API_KEY'),
  'provider.openai.model.model': sec('CAMUNDA_PROVIDED_LLM_DEFAULT_MODEL'),
  'data.systemPrompt.prompt': '="You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\\n\\nIf tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don\'t guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you\'re not able to find a good answer, return with a message stating why you\'re not able to."',
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
  'resultVariable': 'agent',
  'retryCount': '3',
  'retryBackoff': 'PT0S'
});
cli.set(ag, { id: 'AI_Agent', name: 'AI Agent' }); ag = 'AI_Agent';

const tools = [
  ['LookupSampleUsers', 'Find sample users', 0, 0, 'https://jsonplaceholder.typicode.com/users',
   '={ toolCallResult: for user in response.body return { id: user.id, name: user.name, username: user.username } }',
   'Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.'],
  ['SearchRecipes', 'Search recipes', 0, 1, 'https://dummyjson.com/recipes/search',
   '={ toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found." }',
   'Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."'],
  ['FetchSafeJoke', 'Get a safe joke', 1, 0, 'https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode',
   '={ toolCallResult: response.body }',
   'Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.'],
  ['ListSampleTechnologyProducts', 'List sample technology products', 1, 1, 'https://api.restful-api.dev/objects',
   '={ toolCallResult: response.body }',
   'Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.']
];
for (const [id, name, col, row, url, res, doc] of tools) {
  let t = cli.create('bpmn:ServiceTask', { x: 550 + col * 240, y: 210 + row * 160 }, ag);
  const vals = {
    method: 'GET', url, 'authentication.type': 'noAuth',
    connectionTimeoutInSeconds: '20', readTimeoutInSeconds: '20',
    resultExpression: res, retryCount: '3', retryBackoff: 'PT0S'
  };
  if (id === 'SearchRecipes') vals.queryParameters = '={ q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).") }';
  t = cli.template(t, 'io.camunda.connectors.HttpJson.v2', vals);
  cli.set(t, { id, name });
  cli.doc(id, doc);
}

let ut = cli.create('bpmn:UserTask', { x: 1070, y: 300 }, P);
cli.set(ut, { id: 'UserTask_ReviewAgentResponse', name: 'User Feedback' }); ut = 'UserTask_ReviewAgentResponse';
cli.zeebe(ut, 'zeebe:UserTask');
cli.zeebe(ut, 'zeebe:FormDefinition', { formId: 'ai-agent-chat-user-feedback' });
cli.input(ut, 'responseText', '=agent.responseText');

let g2 = cli.create('bpmn:ExclusiveGateway', { x: 1230, y: 300 }, P);
cli.set(g2, { id: 'Gateway_UserSatisfied', name: 'User satisfied?' }); g2 = 'Gateway_UserSatisfied';
let end = cli.create('bpmn:EndEvent', { x: 1380, y: 300 }, P);
cli.set(end, { id: 'EndEvent_UserSatisfied', name: 'User satisfied' }); end = 'EndEvent_UserSatisfied';

const flow = (a, b, id, name, cond) => {
  let f = cli.connect(a, b, 'bpmn:SequenceFlow');
  if (id) { cli.set(f, { id }); f = id; }
  if (name) cli.set(f, { name });
  if (cond) cli.condition(f, cond);
  return f;
};
flow(start, gw, 'Flow_Start');
flow(gw, ag, 'Flow_ToAgent');
flow(ag, ut, 'Flow_ToFeedback');
flow(ut, g2, 'Flow_ToDecision');
flow(g2, end, 'Flow_Yes', 'Yes', '=userSatisfied');
const no = flow(g2, gw, 'Flow_No', 'No', '=userSatisfied = null or userSatisfied = false');
cli.waypoints(no, [[1255, 325], [1255, 540], [355, 540], [355, 325]]);

cli.annotate(start, 'Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.', { id: 'TextAnnotation_Start', width: 200, height: 90, dy: -150 });
cli.annotate(ag, 'This is your agent running certain tasks to reach the goal it was given', { id: 'TextAnnotation_Agent', width: 150, height: 60, dx: -400, dy: 20 });
cli.annotate('FetchSafeJoke', 'Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it\'s good for based on its documentation.', { id: 'TextAnnotation_Tools', width: 220, height: 90, dx: 120, dy: 230 });
