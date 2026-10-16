cli.definitions({ 'modeler:executionPlatform': 'Camunda Cloud', 'modeler:executionPlatformVersion': '8.10.0' });
cli.set('Process_1', { id: 'ai-agent-chat-with-tools', name: 'AI Agent Chat With Tools', isExecutable: true });
cli.set('StartEvent_1', { id: 'StartEvent_TaskReceived', name: 'Task to perform received' });
cli.zeebe('StartEvent_TaskReceived', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-initial-request' });

let gw = cli.append('StartEvent_TaskReceived', 'bpmn:ExclusiveGateway', '150,0');
cli.set(gw, { id: 'Gateway_RunAgent' });
let sp = cli.append('Gateway_RunAgent', 'bpmn:SubProcess', '400,0');
sp = cli.replace(sp, 'bpmn:AdHocSubProcess', { isExpanded: true });
sp = cli.template(sp, 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2', {
  'provider.type': 'openai',
  'provider.openai.api.type': 'responses',
  'provider.openai.backend.type': 'custom',
  'provider.openai.backend.custom.endpoint': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_ENDPOINT',
  'provider.openai.backend.custom.authentication.type': 'apiKey',
  'provider.openai.backend.custom.authentication.apiKey': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_KEY',
  'provider.openai.model.model': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_DEFAULT_MODEL',
  'data.systemPrompt.prompt': '="You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\\n\\nIf tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don\'t guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you\'re not able to find a good answer, return with a message stating why you\'re not able to."',
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
  'retryCount': '3',
  'retryBackoff': 'PT0S'
});
cli.set(sp, { id: 'AI_Agent', name: 'AI Agent' });
cli.resize('AI_Agent', { width: 460, height: 330 });

const http = (parent, x, y, id, name, url, extra, result, docText) => {
  let t = cli.create('bpmn:ServiceTask', x + ',' + y, parent);
  t = cli.template(t, 'io.camunda.connectors.HttpJson.v2', Object.assign({
    'authentication.type': 'noAuth', 'method': 'GET', 'url': url,
    'connectionTimeoutInSeconds': '20', 'readTimeoutInSeconds': '20',
    'resultExpression': result, 'retryCount': '3', 'retryBackoff': 'PT0S'
  }, extra || {}));
  cli.set(t, { id: id, name: name });
  cli.doc(id, docText);
  return t;
};
http('AI_Agent', 800, 190, 'LookupSampleUsers', 'Find sample users', 'https://jsonplaceholder.typicode.com/users', {},
  '={ toolCallResult: for user in response.body return { id: user.id, name: user.name, username: user.username } }',
  'Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.');
http('AI_Agent', 800, 320, 'SearchRecipes', 'Search recipes', 'https://dummyjson.com/recipes/search',
  { 'queryParameters': '={ q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).") }' },
  '={ toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found." }',
  'Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."');
http('AI_Agent', 1000, 190, 'FetchSafeJoke', 'Get a safe joke', 'https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode',
  { 'documentReturnFormat': 'TEXT' }, '={ toolCallResult: response.body }',
  'Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.');
http('AI_Agent', 1000, 320, 'ListSampleTechnologyProducts', 'List sample technology products', 'https://api.restful-api.dev/objects', {},
  '={ toolCallResult: response.body }',
  'Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.');

let ut = cli.append('AI_Agent', 'bpmn:UserTask', '400,0');
cli.set(ut, { id: 'UserTask_ReviewAgentResponse', name: 'User Feedback' });
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:UserTask');
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-user-feedback' });
cli.input('UserTask_ReviewAgentResponse', 'responseText', '=agent.responseText');
let g2 = cli.append('UserTask_ReviewAgentResponse', 'bpmn:ExclusiveGateway', '170,0');
cli.set(g2, { id: 'Gateway_UserSatisfied', name: 'User satisfied?' });
let en = cli.create('bpmn:EndEvent', '1640,245', 'ai-agent-chat-with-tools');
cli.set(en, { id: 'EndEvent_UserSatisfied', name: 'User satisfied' });
let yes = cli.connect('Gateway_UserSatisfied', 'EndEvent_UserSatisfied', 'bpmn:SequenceFlow');
cli.set(yes, { id: 'Flow_Yes', name: 'Yes' });
cli.condition('Flow_Yes', '=userSatisfied');
let no = cli.connect('Gateway_UserSatisfied', 'Gateway_RunAgent', 'bpmn:SequenceFlow');
cli.set(no, { id: 'Flow_No', name: 'No' });
cli.condition('Flow_No', '=userSatisfied = null or userSatisfied = false');

cli.annotate('StartEvent_TaskReceived', 'Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.', { id: 'TextAnnotation_Start', width: 300, height: 100, dx: 100, dy: -150 });
cli.annotate('AI_Agent', 'This is your agent running certain tasks to reach the goal it was given', { id: 'TextAnnotation_Agent', width: 200, height: 70, dx: -460, dy: 270 });
cli.annotate('FetchSafeJoke', 'Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it\'s good for based on its documentation.', { id: 'TextAnnotation_Tools', width: 300, height: 90, dx: 400, dy: 280 });
