import subprocess, os
from xml.sax.saxutils import escape, quoteattr

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "ai-agent-chat-with-tools.bpmn")
RAW = os.path.join(HERE, "skeleton.bpmn")


def q(s):
    return quoteattr(s)


SYS = ("You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\n\n"
       "If tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don't guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you're not able to find a good answer, return with a message stating why you're not able to.")
SYS_FEEL = '="' + SYS.replace("\n", "\\n") + '"'

TOOLS = [
    dict(id="LookupSampleUsers", name="Find sample users", col=0, row=0,
         url="https://jsonplaceholder.typicode.com/users",
         res="={ toolCallResult: for user in response.body return { id: user.id, name: user.name, username: user.username } }",
         doc="Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username."),
    dict(id="SearchRecipes", name="Search recipes", col=0, row=1,
         url="https://dummyjson.com/recipes/search",
         qp='={ q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).", "string") }',
         res='={ toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found." }',
         doc='Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or "No result found."'),
    dict(id="FetchSafeJoke", name="Get a safe joke", col=1, row=0,
         url="https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode",
         res="={ toolCallResult: response.body }",
         doc="Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text."),
    dict(id="ListSampleTechnologyProducts", name="List sample technology products", col=1, row=1,
         url="https://api.restful-api.dev/objects",
         res="={ toolCallResult: response.body }",
         doc="Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data."),
]

ANN1 = "Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied."
ANN2 = "This is your agent running certain tasks to reach the goal it was given"
ANN3 = "Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it's good for based on its documentation."

# geometry (x, y, w, h)
G = {
    "StartEvent_TaskReceived": (152, 282, 36, 36),
    "Gateway_RunAgent": (265, 275, 50, 50),
    "AI_Agent": (380, 120, 520, 360),
    "UserTask_ReviewAgentResponse": (960, 260, 100, 80),
    "Gateway_UserSatisfied": (1110, 275, 50, 50),
    "EndEvent_UserSatisfied": (1230, 282, 36, 36),
    "Ann1": (60, 110, 210, 120),
    "Ann2": (200, 400, 150, 80),
    "Ann3": (940, 410, 230, 110),
}
for t in TOOLS:
    G[t["id"]] = (440 + t["col"] * 260, 170 + t["row"] * 160, 100, 80)

tools_xml = "".join(
    f'<bpmn:serviceTask id="{t["id"]}" name={q(t["name"])}><bpmn:documentation>{escape(t["doc"])}</bpmn:documentation></bpmn:serviceTask>\n'
    for t in TOOLS)

sk = f'''<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:modeler="http://camunda.org/schema/modeler/1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Cloud" modeler:executionPlatformVersion="8.10.0">
<bpmn:process id="ai-agent-chat-with-tools" name="AI Agent Chat With Tools" isExecutable="true">
<bpmn:startEvent id="StartEvent_TaskReceived" name="Task to perform received">
<bpmn:extensionElements><zeebe:formDefinition formId="ai-agent-chat-initial-request" /></bpmn:extensionElements>
<bpmn:outgoing>Flow_Start</bpmn:outgoing>
</bpmn:startEvent>
<bpmn:exclusiveGateway id="Gateway_RunAgent">
<bpmn:incoming>Flow_Start</bpmn:incoming><bpmn:incoming>Flow_No</bpmn:incoming><bpmn:outgoing>Flow_ToAgent</bpmn:outgoing>
</bpmn:exclusiveGateway>
<bpmn:adHocSubProcess id="AI_Agent" name="AI Agent">
<bpmn:incoming>Flow_ToAgent</bpmn:incoming><bpmn:outgoing>Flow_ToUser</bpmn:outgoing>
{tools_xml}</bpmn:adHocSubProcess>
<bpmn:userTask id="UserTask_ReviewAgentResponse" name="User Feedback">
<bpmn:extensionElements>
<zeebe:userTask />
<zeebe:formDefinition formId="ai-agent-chat-user-feedback" />
<zeebe:ioMapping><zeebe:input source="=agent.responseText" target="responseText" /></zeebe:ioMapping>
</bpmn:extensionElements>
<bpmn:incoming>Flow_ToUser</bpmn:incoming><bpmn:outgoing>Flow_ToSatisfied</bpmn:outgoing>
</bpmn:userTask>
<bpmn:exclusiveGateway id="Gateway_UserSatisfied" name="User satisfied?">
<bpmn:incoming>Flow_ToSatisfied</bpmn:incoming><bpmn:outgoing>Flow_Yes</bpmn:outgoing><bpmn:outgoing>Flow_No</bpmn:outgoing>
</bpmn:exclusiveGateway>
<bpmn:endEvent id="EndEvent_UserSatisfied" name="User satisfied"><bpmn:incoming>Flow_Yes</bpmn:incoming></bpmn:endEvent>
<bpmn:sequenceFlow id="Flow_Start" sourceRef="StartEvent_TaskReceived" targetRef="Gateway_RunAgent" />
<bpmn:sequenceFlow id="Flow_ToAgent" sourceRef="Gateway_RunAgent" targetRef="AI_Agent" />
<bpmn:sequenceFlow id="Flow_ToUser" sourceRef="AI_Agent" targetRef="UserTask_ReviewAgentResponse" />
<bpmn:sequenceFlow id="Flow_ToSatisfied" sourceRef="UserTask_ReviewAgentResponse" targetRef="Gateway_UserSatisfied" />
<bpmn:sequenceFlow id="Flow_Yes" name="Yes" sourceRef="Gateway_UserSatisfied" targetRef="EndEvent_UserSatisfied"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">=userSatisfied</bpmn:conditionExpression></bpmn:sequenceFlow>
<bpmn:sequenceFlow id="Flow_No" name="No" sourceRef="Gateway_UserSatisfied" targetRef="Gateway_RunAgent"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">=userSatisfied = null or userSatisfied = false</bpmn:conditionExpression></bpmn:sequenceFlow>
<bpmn:textAnnotation id="Annotation_1"><bpmn:text>{escape(ANN1)}</bpmn:text></bpmn:textAnnotation>
<bpmn:association id="Assoc_1" associationDirection="None" sourceRef="StartEvent_TaskReceived" targetRef="Annotation_1" />
<bpmn:textAnnotation id="Annotation_2"><bpmn:text>{escape(ANN2)}</bpmn:text></bpmn:textAnnotation>
<bpmn:association id="Assoc_2" associationDirection="None" sourceRef="AI_Agent" targetRef="Annotation_2" />
<bpmn:textAnnotation id="Annotation_3"><bpmn:text>{escape(ANN3)}</bpmn:text></bpmn:textAnnotation>
<bpmn:association id="Assoc_3" associationDirection="None" sourceRef="FetchSafeJoke" targetRef="Annotation_3" />
</bpmn:process>
</bpmn:definitions>
'''
def shape(id_, bid, extra=""):
    x, y, w, h = G[id_]
    return f'<bpmndi:BPMNShape id="{bid}_di" bpmnElement="{bid}"{extra}><dc:Bounds x="{x}" y="{y}" width="{w}" height="{h}" /></bpmndi:BPMNShape>\n'


def edge(bid, pts, label=None):
    s = f'<bpmndi:BPMNEdge id="{bid}_di" bpmnElement="{bid}">' + "".join(f'<di:waypoint x="{x}" y="{y}" />' for x, y in pts)
    if label:
        s += f'<bpmndi:BPMNLabel><dc:Bounds x="{label[0]}" y="{label[1]}" width="{label[2]}" height="14" /></bpmndi:BPMNLabel>'
    return s + "</bpmndi:BPMNEdge>\n"


def lbl(id_, bid, dx, dy, w):
    x, y, ww, h = G[id_]
    return (f'<bpmndi:BPMNShape id="{bid}_di" bpmnElement="{bid}"><dc:Bounds x="{x}" y="{y}" width="{ww}" height="{h}" />'
            f'<bpmndi:BPMNLabel><dc:Bounds x="{x+dx}" y="{y+dy}" width="{w}" height="27" /></bpmndi:BPMNLabel></bpmndi:BPMNShape>\n')


d = '<bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="ai-agent-chat-with-tools">\n'
d += lbl("StartEvent_TaskReceived", "StartEvent_TaskReceived", -22, 42, 80)
d += shape("Gateway_RunAgent", "Gateway_RunAgent", ' isMarkerVisible="true"')
d += shape("AI_Agent", "AI_Agent", ' isExpanded="true"')
for t in TOOLS:
    d += shape(t["id"], t["id"])
d += shape("UserTask_ReviewAgentResponse", "UserTask_ReviewAgentResponse")
d += ('<bpmndi:BPMNShape id="Gateway_UserSatisfied_di" bpmnElement="Gateway_UserSatisfied" isMarkerVisible="true"><dc:Bounds x="1110" y="275" width="50" height="50" />'
      '<bpmndi:BPMNLabel><dc:Bounds x="1097" y="332" width="76" height="14" /></bpmndi:BPMNLabel></bpmndi:BPMNShape>\n')
d += lbl("EndEvent_UserSatisfied", "EndEvent_UserSatisfied", -10, 42, 60)
for a in ("1", "2", "3"):
    d += shape("Ann" + a, "Annotation_" + a)
d += edge("Flow_Start", [(188, 300), (265, 300)])
d += edge("Flow_ToAgent", [(315, 300), (380, 300)])
d += edge("Flow_ToUser", [(900, 300), (960, 300)])
d += edge("Flow_ToSatisfied", [(1060, 300), (1110, 300)])
d += edge("Flow_Yes", [(1160, 300), (1230, 300)], (1186, 282, 20))
d += edge("Flow_No", [(1135, 275), (1135, 60), (290, 60), (290, 275)], (700, 42, 16))
d += edge("Assoc_1", [(170, 283), (170, 230)])
d += edge("Assoc_2", [(380, 420), (350, 440)])
d += edge("Assoc_3", [(750, 250), (750, 440), (940, 440)])
d += '</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>\n'

open(RAW, "w").write(sk.replace("</bpmn:definitions>", d + "</bpmn:definitions>"))


def apply(tpl, el, sets):
    cmd = ["c8ctl", "element-template", "apply", "-i", tpl, el, RAW]
    for k, v in sets.items():
        cmd += ["--set", f"{k}={v}"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"apply failed for {el}: {r.stdout}{r.stderr}")


agent_sets = {
    "provider.type": "openai",
    "provider.openai.api.type": "responses",
    "provider.openai.backend.type": "custom",
    "provider.openai.backend.custom.endpoint": "=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_ENDPOINT",
    "provider.openai.backend.custom.authentication.type": "apiKey",
    "provider.openai.backend.custom.authentication.apiKey": "=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_KEY",
    "provider.openai.model.model": "=camunda.secrets.CAMUNDA_PROVIDED_LLM_DEFAULT_MODEL",
    "data.systemPrompt.prompt": SYS_FEEL,
    "data.userPrompt.prompt": "=if is defined(followUpInput) then followUpInput else inputText",
    "data.userPrompt.documents": "=if is defined(followUpInput) or is defined(followUpDocuments) then followUpDocuments else inputDocuments",
    "agentContext": "=agent.context",
    "data.memory.storage.type": "in-process",
    "data.memory.contextWindowSize": "20",
    "data.limits.maxModelCalls": "10",
    "data.events.behavior": "WAIT_FOR_TOOL_CALL_RESULTS",
    "data.response.format.type": "text",
    "data.response.format.parseJson": "false",
    "data.response.includeAssistantMessage": "false",
    "data.response.includeAgentContext": "true",
    "retries": "3",
    "retryBackoff": "PT0S",
}
apply("io.camunda.connectors.agenticai.ai-agent-subprocess.v2", "AI_Agent", agent_sets)

for t in TOOLS:
    s = {"authentication.type": "noAuth", "method": "GET", "url": t["url"],
         "connectionTimeoutInSeconds": "20", "readTimeoutInSeconds": "20",
         "ignoreNullValues": "false", "resultExpression": t["res"],
         "retries": "3", "retryBackoff": "PT0S"}
    if "qp" in t:
        s["queryParameters"] = t["qp"]
    apply("io.camunda.connectors.HttpJson.v2", t["id"], s)


os.replace(RAW, OUT)
print("wrote", OUT)
