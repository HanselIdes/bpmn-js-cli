cli.definitions({ 'modeler:executionPlatformVersion': '8.10.0' });
cli.set('Process_1', { id: 'ai-agent-chat-with-tools', name: 'AI Agent Chat With Tools' });
cli.set('StartEvent_1', { id: 'StartEvent_TaskReceived', name: 'Task to perform received' });
cli.zeebe('StartEvent_TaskReceived', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-initial-request' });

var gw = cli.append('StartEvent_TaskReceived', 'bpmn:ExclusiveGateway', '150,0', 'Flow_StartToGateway');
cli.set(gw, { id: 'Gateway_RunAgent' });
var t = cli.append('Gateway_RunAgent', 'bpmn:Task', '150,0', 'Flow_GatewayToAgent');
var ag = cli.replace(t, 'bpmn:AdHocSubProcess', { isExpanded: true });
cli.set(ag, { id: 'AI_Agent', name: 'AI Agent' });

var sys = "=\"You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\n\nIf tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don't guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you're not able to find a good answer, return with a message stating why you're not able to.\"";
var agentId = cli.template('AI_Agent', 'io.camunda.connectors.agenticai.ai-agent-subprocess.v2', {
  'provider.type': 'openai',
  'provider.openai.api.type': 'responses',
  'provider.openai.backend.type': 'custom',
  'provider.openai.backend.custom.endpoint': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_ENDPOINT',
  'provider.openai.backend.custom.authentication.type': 'apiKey',
  'provider.openai.backend.custom.authentication.apiKey': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_KEY',
  'provider.openai.model.model': '=camunda.secrets.CAMUNDA_PROVIDED_LLM_DEFAULT_MODEL',
  'data.systemPrompt.prompt': sys,
  'data.userPrompt.prompt': '=if (is defined(followUpInput)) then followUpInput else inputText',
  'data.userPrompt.documents': '=if (is defined(followUpInput) or is defined(followUpDocuments)) then followUpDocuments else inputDocuments',
  'agentContext': '=agent.context',
  'data.response.format.parseJson': false,
  'data.response.includeAssistantMessage': false,
  'data.response.includeAgentContext': true,
  'retryBackoff': 'PT0S'
}, { version: 1 });
if (agentId && agentId !== 'AI_Agent') cli.set(agentId, { id: 'AI_Agent' });

var ut = cli.append('AI_Agent', 'bpmn:UserTask', '200,0', 'Flow_AgentToFeedback');
cli.set(ut, { id: 'UserTask_ReviewAgentResponse', name: 'User Feedback' });
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:UserTask', {});
cli.zeebe('UserTask_ReviewAgentResponse', 'zeebe:FormDefinition', { formId: 'ai-agent-chat-user-feedback' });
cli.input('UserTask_ReviewAgentResponse', 'responseText', '=agent.responseText');

var g2 = cli.append('UserTask_ReviewAgentResponse', 'bpmn:ExclusiveGateway', '150,0', 'Flow_FeedbackToSatisfied');
cli.set(g2, { id: 'Gateway_UserSatisfied', name: 'User satisfied?' });
var e = cli.append('Gateway_UserSatisfied', 'bpmn:EndEvent', '150,0', 'Flow_Yes');
cli.set(e, { id: 'EndEvent_UserSatisfied', name: 'User satisfied' });
cli.set('Flow_Yes', { name: 'Yes' });
cli.condition('Flow_Yes', '=userSatisfied');
cli.connect('Gateway_UserSatisfied', 'Gateway_RunAgent', 'bpmn:SequenceFlow', '-', 'Flow_No');
cli.set('Flow_No', { name: 'No' });
cli.condition('Flow_No', '=userSatisfied = null or userSatisfied = false');

function tool(id, name, x, y, url, extra, resExpr, docText) {
  var tid = cli.create('bpmn:ServiceTask', x + ',' + y, 'AI_Agent');
  cli.set(tid, { id: id, name: name });
  var vals = { url: url, resultExpression: resExpr, retryBackoff: 'PT0S' };
  for (var k in extra) vals[k] = extra[k];
  var nid = cli.template(id, 'io.camunda.connectors.HttpJson.v2', vals, { version: 18 });
  if (nid && nid !== id) cli.set(nid, { id: id });
  cli.doc(id, docText);
}

cli.afterLayout(function () {
  var s = cli.element('StartEvent_TaskReceived');
  var a0 = cli.element('AI_Agent');
  var W = 420, H = 300;
  var cy = s.y + s.height / 2;
  var dx = W - a0.width;
  ['UserTask_ReviewAgentResponse', 'Gateway_UserSatisfied', 'EndEvent_UserSatisfied'].forEach(function (id) {
    cli.move(id, dx + ',0');
  });
  cli.resize('AI_Agent', { x: a0.x, y: cy - H / 2, width: W, height: H });
  var stray = cli.elements();
  stray = (Array.isArray(stray) ? stray : Object.keys(stray)).map(function (x) { return typeof x === 'string' ? x : x.id; }).filter(function (id) { return /^Event_/.test(id); });
  stray.forEach(function (id) { cli.removeShape(id); });
  var a = cli.element('AI_Agent');
  var g2e = cli.element('Gateway_UserSatisfied'), g1 = cli.element('Gateway_RunAgent');
  var loopY = a.y + a.height + 40;
  cli.waypoints('Flow_No', [[g2e.x + g2e.width / 2, g2e.y + g2e.height], [g2e.x + g2e.width / 2, loopY], [g1.x + g1.width / 2, loopY], [g1.x + g1.width / 2, g1.y + g1.height]]);
  cli.annotate('StartEvent_TaskReceived', 'Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.', { width: 220, height: 80, dy: -140, dx: 60 });
  cli.annotate('AI_Agent', 'This is your agent running certain tasks to reach the goal it was given', { width: 180, height: 60, dx: -(a.width / 2 + 100), dy: -80 });
  var ax = a.x, ay = a.y;
  var colX = [ax + 40, ax + 40 + 100 + 60], rowY = [ay + 40, ay + 40 + 80 + 40];
  // centre positions for create
  tool('LookupSampleUsers', 'Find sample users', colX[0] + 50, rowY[0] + 40, 'https://jsonplaceholder.typicode.com/users', {},
    '={\n  toolCallResult: for user in response.body return {id: user.id, name: user.name, username: user.username}\n}',
    'Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.');
  tool('SearchRecipes', 'Search recipes', colX[0] + 50, rowY[1] + 40, 'https://dummyjson.com/recipes/search',
    { queryParameters: '={q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).")}' },
    '={\n  toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found."\n}',
    'Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."');
  tool('FetchSafeJoke', 'Get a safe joke', colX[1] + 50, rowY[0] + 40, 'https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode', {},
    '={\n  toolCallResult: response.body\n}',
    'Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.');
  tool('ListSampleTechnologyProducts', 'List sample technology products', colX[1] + 50, rowY[1] + 40, 'https://api.restful-api.dev/objects', {},
    '={\n  toolCallResult: response.body\n}',
    'Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.');
  cli.annotate('FetchSafeJoke', 'Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it\'s good for based on its documentation.', { parent: 'ai-agent-chat-with-tools', width: 220, height: 80, dx: 320, dy: 170 });
});
