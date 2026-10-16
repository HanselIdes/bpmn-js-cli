cli.definitions({ 'modeler:executionPlatformVersion': '8.10.0', 'modeler:executionPlatform': 'Camunda Cloud' });
cli.set('Process_1', { id: 'ai-agent-chat-with-tools', name: 'AI Agent Chat With Tools' });

cli.set('StartEvent_1', { id: 'StartEvent_TaskReceived', name: 'Task to perform received' });
cli.zeebe('StartEvent_TaskReceived', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-initial-request' });

let g1 = cli.append('StartEvent_TaskReceived', 'bpmn:ExclusiveGateway', '120,0', 'Flow_StartToGateway');
cli.set(g1, { id: 'Gateway_RunAgent' });

let t = cli.append('Gateway_RunAgent', 'bpmn:Task', '320,0', 'Flow_GatewayToAgent');
let sub = cli.replace(t, 'bpmn:AdHocSubProcess', { isExpanded: true });
cli.set(sub, { id: 'AI_Agent', name: 'AI Agent' });
cli.resize('AI_Agent', { x: 400, y: 130, width: 440, height: 340 });

const SP = 'You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\n\nIf tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don\'t guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you\'re not able to find a good answer, return with a message stating why you\'re not able to.';

let agent = cli.template('AI_Agent', 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2', {
  'provider.type': 'openai',
  'provider.openai.api.type': 'responses',
  'provider.openai.backend.type': 'custom',
  'provider.openai.backend.custom.endpoint': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_ENDPOINT',
  'provider.openai.backend.custom.authentication.type': 'apiKey',
  'provider.openai.backend.custom.authentication.apiKey': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_KEY',
  'provider.openai.model.model': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_DEFAULT_MODEL',
  'data.systemPrompt.prompt': '="' + SP + '"',
  'data.userPrompt.prompt': '=if is defined(followUpInput) then followUpInput else inputText',
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
}, { version: 1 });
if (agent !== 'AI_Agent') cli.set(agent, { id: 'AI_Agent' });

function tool(id, name, x, y, url, resultExpr, docText, extra) {
  let s = cli.create('bpmn:ServiceTask', x + ',' + y, 'AI_Agent');
  cli.set(s, { id: id, name: name });
  const vals = Object.assign({
    'method': 'GET',
    'url': url,
    'connectionTimeoutInSeconds': '20',
    'readTimeoutInSeconds': '20',
    'resultExpression': resultExpr,
    'retryCount': '3',
    'retryBackoff': 'PT0S'
  }, extra || {});
  let n = cli.template(id, 'io.camunda.connectors.HttpJson.v2', vals, { version: 18 });
  if (n !== id) cli.set(n, { id: id });
  cli.doc(id, docText);
}

tool('LookupSampleUsers', 'Find sample users', 500, 220,
  'https://jsonplaceholder.typicode.com/users',
  '={toolCallResult: for user in response.body return {id: user.id, name: user.name, username: user.username}}',
  'Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.');
tool('SearchRecipes', 'Search recipes', 500, 360,
  'https://dummyjson.com/recipes/search',
  '={toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found."}',
  'Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."',
  { 'queryParameters': '={q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).")}' });
tool('FetchSafeJoke', 'Get a safe joke', 720, 220,
  'https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode',
  '={toolCallResult: response.body}',
  'Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.');
tool('ListSampleTechnologyProducts', 'List sample technology products', 720, 360,
  'https://api.restful-api.dev/objects',
  '={toolCallResult: response.body}',
  'Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.');

// user task, gateway, end
let ut = cli.append('AI_Agent', 'bpmn:UserTask', '330,0', 'Flow_AgentToFeedback');
cli.set(ut, { id: 'UserTask_ReviewAgentResponse', name: 'User Feedback' });
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:UserTask', {});
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-user-feedback' });
cli.input('UserTask_ReviewAgentResponse', 'responseText', '=agent.responseText');

let g2 = cli.append('UserTask_ReviewAgentResponse', 'bpmn:ExclusiveGateway', '150,0', 'Flow_FeedbackToSatisfied');
cli.set(g2, { id: 'Gateway_UserSatisfied', name: 'User satisfied?' });
let en = cli.append('Gateway_UserSatisfied', 'bpmn:EndEvent', '130,0', 'Flow_Yes');
cli.set(en, { id: 'EndEvent_UserSatisfied', name: 'User satisfied' });
cli.set('Flow_Yes', { name: 'Yes' });
cli.condition('Flow_Yes', '=userSatisfied');
cli.connect('Gateway_UserSatisfied', 'Gateway_RunAgent', 'bpmn:SequenceFlow', '-', 'Flow_No');
cli.set('Flow_No', { name: 'No' });
cli.condition('Flow_No', '=userSatisfied = null or userSatisfied = false');

// layout and cleanup
for (const e of cli.elements()) { const id = typeof e === 'string' ? e : e.id; if (/^Event_/.test(id) && id !== 'EndEvent_UserSatisfied') cli.removeShape(id); }
cli.move('StartEvent_TaskReceived', '0,180');
cli.move('Gateway_RunAgent', '0,180');
cli.waypoints('Flow_No', [[1100, 325], [1100, 560], [290, 560], [290, 325]]);

cli.annotate('StartEvent_TaskReceived', 'Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.', { id: 'TextAnnotation_Start', associationId: 'Association_Start', dy: -110, width: 240, height: 80 });
cli.annotate('AI_Agent', 'This is your agent running certain tasks to reach the goal it was given', { id: 'TextAnnotation_Agent', associationId: 'Association_Agent', dx: -350, dy: 330, width: 180, height: 60 });
cli.annotate('FetchSafeJoke', 'Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it\'s good for based on its documentation.', { id: 'TextAnnotation_Tools', associationId: 'Association_Tools', dx: 300, dy: 250, width: 240, height: 90, parent: 'ai-agent-chat-with-tools' });
