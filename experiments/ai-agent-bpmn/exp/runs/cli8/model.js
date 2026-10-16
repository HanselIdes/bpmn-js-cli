const PROC = 'ai-agent-chat-with-tools';
cli.definitions({ 'modeler:executionPlatformVersion': '8.10.0' });
cli.set('Process_1', { id: PROC, name: 'AI Agent Chat With Tools' });
cli.set('StartEvent_1', { id: 'StartEvent_TaskReceived', name: 'Task to perform received' });
const S = 'StartEvent_TaskReceived';
cli.zeebe(S, 'zeebe:FormDefinition', { formId: 'ai-agent-chat-initial-request' });

const gw = cli.append(S, 'bpmn:ExclusiveGateway', '150,0', 'Flow_Start');
cli.set(gw, { id: 'Gateway_RunAgent' });
const sub = cli.append('Gateway_RunAgent', 'bpmn:SubProcess', '350,0', 'Flow_ToAgent');
let AI = cli.replace(sub, 'bpmn:AdHocSubProcess', { isExpanded: true });
cli.set(AI, { id: 'AI_Agent', name: 'AI Agent' });
AI = 'AI_Agent';
cli.resize(AI, { x: 490, y: -40, width: 440, height: 320 });

// tools: 2x2 grid
const tools = [
  ['LookupSampleUsers', 'Find sample users', '600,80'],
  ['SearchRecipes', 'Search recipes', '600,200'],
  ['FetchSafeJoke', 'Get a safe joke', '800,80'],
  ['ListSampleTechnologyProducts', 'List sample technology products', '800,200'],
];
for (const [id, name, pos] of tools) {
  const t = cli.create('bpmn:ServiceTask', pos, AI);
  cli.set(t, { id, name });
}

const SYS = 'You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\\n\\nIf tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don\'t guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you\'re not able to find a good answer, return with a message stating why you\'re not able to.';

AI = cli.template(AI, 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2', {
  'provider.type': 'openai',
  'provider.openai.backend.type': 'custom',
  'provider.openai.backend.custom.endpoint': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_ENDPOINT',
  'provider.openai.backend.custom.authentication.type': 'apiKey',
  'provider.openai.backend.custom.authentication.apiKey': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_KEY',
  'provider.openai.model.model': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_DEFAULT_MODEL',
  'data.systemPrompt.prompt': '="' + SYS + '"',
  'data.userPrompt.prompt': '=if is defined(followUpInput) then followUpInput else inputText',
  'data.userPrompt.documents': '=if is defined(followUpInput) or is defined(followUpDocuments) then followUpDocuments else inputDocuments',
  'agentContext': '=agent.context',
  'data.response.format.parseJson': false,
  'data.response.includeAssistantMessage': false,
  'data.response.includeAgentContext': true,
  'retryBackoff': 'PT0S',
}, { version: 1 });
console.log('AI id after template: ' + AI);

const H = 'io.camunda.connectors.HttpJson.v2';
const T = {
  LookupSampleUsers: {
    url: 'https://jsonplaceholder.typicode.com/users',
    resultExpression: '={\n  toolCallResult: for user in response.body return {\n    id: user.id,\n    name: user.name,\n    username: user.username\n  }\n}',
    doc: 'Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.',
  },
  SearchRecipes: {
    url: 'https://dummyjson.com/recipes/search',
    queryParameters: '={\n  q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).", "string")\n}',
    resultExpression: '={\n  toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found."\n}',
    doc: 'Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."',
  },
  FetchSafeJoke: {
    url: 'https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode',
    resultExpression: '={\n  toolCallResult: response.body\n}',
    doc: 'Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.',
  },
  ListSampleTechnologyProducts: {
    url: 'https://api.restful-api.dev/objects',
    resultExpression: '={\n  toolCallResult: response.body\n}',
    doc: 'Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.',
  },
};
for (const id of Object.keys(T)) {
  const { doc, ...vals } = T[id];
  const nid = cli.template(id, H, { ...vals, retryBackoff: 'PT0S' }, { version: 18 });
  console.log('tool ' + id + ' -> ' + nid);
  cli.doc(nid, doc);
}

// main flow after agent
const ut = cli.append(AI, 'bpmn:UserTask', '340,0', 'Flow_ToFeedback');
cli.set(ut, { id: 'UserTask_ReviewAgentResponse', name: 'User Feedback' });
const U = 'UserTask_ReviewAgentResponse';
cli.zeebe(U, 'zeebe:UserTask');
cli.zeebe(U, 'zeebe:FormDefinition', { formId: 'ai-agent-chat-user-feedback' });
cli.input(U, 'responseText', '=agent.responseText');

const g2 = cli.append(U, 'bpmn:ExclusiveGateway', '170,0', 'Flow_ToSatisfied');
cli.set(g2, { id: 'Gateway_UserSatisfied', name: 'User satisfied?' });
const en = cli.append('Gateway_UserSatisfied', 'bpmn:EndEvent', '150,0', 'Flow_Yes');
cli.set(en, { id: 'EndEvent_UserSatisfied', name: 'User satisfied' });
cli.set('Flow_Yes', { name: 'Yes' });
cli.condition('Flow_Yes', '=userSatisfied');
cli.connect('Gateway_UserSatisfied', 'Gateway_RunAgent', 'bpmn:SequenceFlow', '-', 'Flow_No');
cli.set('Flow_No', { name: 'No' });
cli.waypoints('Flow_No', [[1220,145],[1220,330],[320,330],[320,145]]);
cli.condition('Flow_No', '=userSatisfied = null or userSatisfied = false');

// annotations
cli.annotate(S, 'Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.', { id: 'TextAnnotation_Start', width: 300, height: 80, dy: -150 });
cli.annotate(AI, 'This is your agent running certain tasks to reach the goal it was given', { id: 'TextAnnotation_Agent', dx: -330, dy: 240, width: 200, height: 60, parent: PROC });
cli.annotate('FetchSafeJoke', 'Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it\'s good for based on its documentation.', { id: 'TextAnnotation_Tools', dx: 300, dy: 150, width: 240, height: 90, parent: PROC });
