cli.set('Process_1', { id: 'ai-agent-chat-with-tools', name: 'AI Agent Chat With Tools' });
cli.set('StartEvent_1', { id: 'StartEvent_TaskReceived', name: 'Task to perform received' });
cli.zeebe('StartEvent_TaskReceived', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-initial-request' });

cli.set(cli.append('StartEvent_TaskReceived', 'bpmn:ExclusiveGateway', '120,0'), { id: 'Gateway_RunAgent' });
let sub = cli.replace(cli.append('Gateway_RunAgent', 'bpmn:Task', '320,0'), 'bpmn:AdHocSubProcess', { isExpanded: true });
cli.set(sub, { id: 'AI_Agent', name: 'AI Agent' });

// the template defaults already cover: openai api type responses, apiKey auth, in-process memory, window 20,
// 10 model calls, wait for tool results, text format, result variable agent, retries 3
cli.template('AI_Agent', 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2', {
  'provider.type': 'openai',
  'provider.openai.backend.type': 'custom',
  'provider.openai.backend.custom.endpoint': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_ENDPOINT',
  'provider.openai.backend.custom.authentication.apiKey': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_KEY',
  'provider.openai.model.model': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_DEFAULT_MODEL',
  'data.systemPrompt.prompt': '="You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\n\nIf tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don\'t guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you\'re not able to find a good answer, return with a message stating why you\'re not able to."',
  'data.userPrompt.prompt': '=if is defined(followUpInput) then followUpInput else inputText',
  'data.userPrompt.documents': '=if is defined(followUpInput) or is defined(followUpDocuments) then followUpDocuments else inputDocuments',
  'agentContext': '=agent.context',
  'data.response.includeAgentContext': true,
  'retryBackoff': 'PT0S'
}, { version: 1 });

// method GET, 20 s timeouts and 3 retries are template defaults
[
  ['LookupSampleUsers', 'Find sample users', 500, 220, 'https://jsonplaceholder.typicode.com/users',
    '={toolCallResult: for user in response.body return {id: user.id, name: user.name, username: user.username}}',
    'Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.'],
  ['SearchRecipes', 'Search recipes', 500, 360, 'https://dummyjson.com/recipes/search',
    '={toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found."}',
    'Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."',
    '={q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).")}'],
  ['FetchSafeJoke', 'Get a safe joke', 720, 220, 'https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode', '={toolCallResult: response.body}',
    'Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.'],
  ['ListSampleTechnologyProducts', 'List sample technology products', 720, 360, 'https://api.restful-api.dev/objects', '={toolCallResult: response.body}',
    'Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.']
].forEach(([id, name, x, y, url, resultExpression, doc, queryParameters]) => {
  cli.set(cli.create('bpmn:ServiceTask', x + ',' + y, 'AI_Agent'), { id, name });
  cli.template(id, 'io.camunda.connectors.HttpJson.v2', { url, resultExpression, retryBackoff: 'PT0S', ...(queryParameters && { queryParameters }) }, { version: 18 });
  cli.doc(id, doc);
});

let ut = cli.append('AI_Agent', 'bpmn:UserTask', '330,0');
cli.set(ut, { id: 'UserTask_ReviewAgentResponse', name: 'User Feedback' });
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:UserTask');
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-user-feedback' });
cli.input('UserTask_ReviewAgentResponse', 'responseText', '=agent.responseText');

cli.set(cli.append('UserTask_ReviewAgentResponse', 'bpmn:ExclusiveGateway', '150,0'), { id: 'Gateway_UserSatisfied', name: 'User satisfied?' });
cli.set(cli.append('Gateway_UserSatisfied', 'bpmn:EndEvent', '130,0', 'Flow_Yes'), { id: 'EndEvent_UserSatisfied', name: 'User satisfied' });
cli.set('Flow_Yes', { name: 'Yes' });
cli.condition('Flow_Yes', '=userSatisfied');
cli.connect('Gateway_UserSatisfied', 'Gateway_RunAgent', 'bpmn:SequenceFlow', '-', 'Flow_No');
cli.set('Flow_No', { name: 'No' });
cli.condition('Flow_No', '=userSatisfied = null or userSatisfied = false');

// replace() leaves a stray start event inside the ad-hoc sub-process
cli.elements().filter(id => /^Event_/.test(id)).forEach(id => cli.removeShape(id));

cli.annotate('StartEvent_TaskReceived', 'Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.');
cli.annotate('AI_Agent', 'This is your agent running certain tasks to reach the goal it was given');
cli.annotate('FetchSafeJoke', 'Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it\'s good for based on its documentation.');
