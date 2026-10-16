import subprocess, os
from xml.sax.saxutils import escape, quoteattr

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "ai-agent-chat-with-tools.bpmn")

SYS = ("=\"You are **TaskAgent**, a helpful, generic chat agent that can handle a wide variety of customer requests using your own domain knowledge **and** any tools explicitly provided to you at runtime.\n\n"
       "If tools are provided, you should prefer them instead of guessing an answer. You can call the same tool multiple times by providing different input values. Don't guess any tools which were not explicitly configured. If no tool matches the request, try to generate an answer. If you're not able to find a good answer, return with a message stating why you're not able to.\"")

tools = [
 dict(id="LookupSampleUsers", name="Find sample users", col=0, row=0,
  doc="Lists available users. Use this tool to look up names, usernames, or IDs. Do not use it for details not returned by the service. Input: none. Returns: an array of user objects containing id, name, and username.",
  url="https://jsonplaceholder.typicode.com/users",
  res="={toolCallResult: for user in response.body return {id: user.id, name: user.name, username: user.username}}"),
 dict(id="SearchRecipes", name="Search recipes", col=0, row=1,
  doc="Searches the recipe catalog. Use this tool when a request asks for a recipe, dish, cuisine, or cooking instructions. Do not use it for unrelated food facts or guaranteed dietary safety. Input: searchQuery describing the desired dish or cuisine. Returns: matching recipe objects, or \"No result found.\"",
  url="https://dummyjson.com/recipes/search",
  qp='={q: fromAi(toolCall.searchQuery, "The query describing which recipe to search (e.g. a specific dish or the cuisine).")}',
  res='={toolCallResult: if count(response.body.recipes) > 0 then response.body.recipes else "No result found."}'),
 dict(id="FetchSafeJoke", name="Get a safe joke", col=1, row=0,
  doc="Fetches one random safe-mode joke. Use this tool when the user asks for a joke or humorous response. Do not use it when the request requires a specific factual answer or a particular joke topic. Input: none. Returns: the joke as plain text.",
  url="https://v2.jokeapi.dev/joke/Any?format=txt&safe-mode", fmt="TEXT",
  res="={toolCallResult: response.body}"),
 dict(id="ListSampleTechnologyProducts", name="List sample technology products", col=1, row=1,
  doc="Lists technology products. Use this tool when a request asks which devices or technology products are available or needs their attributes. Do not use it for live inventory, pricing, or purchasing. Input: none. Returns: an array of product objects with identifiers, names, and available attribute data.",
  url="https://api.restful-api.dev/objects",
  res="={toolCallResult: response.body}"),
]

SUB = (420, 80, 520, 380)         # x,y,w,h
TW, TH = 120, 90
def tool_xy(t):
    return (SUB[0] + 60 + t["col"] * 260, SUB[1] + 70 + t["row"] * 140)

def tool_xml(t):
    return (f'<bpmn:serviceTask id="{t["id"]}" name={quoteattr(t["name"])}>'
            f'<bpmn:documentation>{escape(t["doc"])}</bpmn:documentation></bpmn:serviceTask>')

xml = f'''<?xml version="1.0" encoding="UTF-8"?>
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
      {"".join(tool_xml(t) for t in tools)}
    </bpmn:adHocSubProcess>
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
    <bpmn:sequenceFlow id="Flow_Yes" name="Yes" sourceRef="Gateway_UserSatisfied" targetRef="EndEvent_UserSatisfied">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">=userSatisfied</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_No" name="No" sourceRef="Gateway_UserSatisfied" targetRef="Gateway_RunAgent">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">=userSatisfied = null or userSatisfied = false</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:textAnnotation id="Annotation_Start"><bpmn:text>Triggered when a user submits a task for the AI agent to perform. The agent uses available tools to complete the task, and the process ends once the user confirms they are satisfied.</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Assoc_Start" associationDirection="None" sourceRef="StartEvent_TaskReceived" targetRef="Annotation_Start" />
    <bpmn:textAnnotation id="Annotation_Agent"><bpmn:text>This is your agent running certain tasks to reach the goal it was given</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Assoc_Agent" associationDirection="None" sourceRef="AI_Agent" targetRef="Annotation_Agent" />
    <bpmn:textAnnotation id="Annotation_Tools"><bpmn:text>Each task you add represents a capability your agent will have. You can add new tasks and the agent will know what it's good for based on its documentation.</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Assoc_Tools" associationDirection="None" sourceRef="FetchSafeJoke" targetRef="Annotation_Tools" />
  </bpmn:process>
'''

def lbl(x, y, w, h):
    return f'<bpmndi:BPMNLabel><dc:Bounds x="{x}" y="{y}" width="{w}" height="{h}" /></bpmndi:BPMNLabel>'
def shape(i, x, y, w, h, extra="", label=""):
    return f'<bpmndi:BPMNShape id="{i}_di" bpmnElement="{i}"{extra}><dc:Bounds x="{x}" y="{y}" width="{w}" height="{h}" />{label}</bpmndi:BPMNShape>'
def edge(i, pts, label=""):
    return (f'<bpmndi:BPMNEdge id="{i}_di" bpmnElement="{i}">'
            + "".join(f'<di:waypoint x="{x}" y="{y}" />' for x, y in pts) + label + '</bpmndi:BPMNEdge>')

CY = SUB[1] + SUB[3] // 2   # 270
UT = (1010, CY - 40)
GS = (1175, CY - 25)
EN = (1292, CY - 18)
GR = (295, CY - 25)
ST = (212, CY - 18)
AN_START = (150, 20, 300, 80); AN_AGENT = (190, 340, 200, 60); AN_TOOLS = (990, 380, 280, 80)
d = ['<bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="ai-agent-chat-with-tools">']
d.append(shape("StartEvent_TaskReceived", *ST, 36, 36, label=lbl(190, ST[1] + 42, 80, 40)))
d.append(shape("Gateway_RunAgent", *GR, 50, 50, ' isMarkerVisible="true"'))
d.append(shape("AI_Agent", *SUB, ' isExpanded="true"'))
for t in tools:
    x, y = tool_xy(t); d.append(shape(t["id"], x, y, TW, TH))
d.append(shape("UserTask_ReviewAgentResponse", UT[0], UT[1], 100, 80))
d.append(shape("Gateway_UserSatisfied", *GS, 50, 50, ' isMarkerVisible="true"', lbl(1160, GS[1] - 20, 80, 14)))
d.append(shape("EndEvent_UserSatisfied", *EN, 36, 36, label=lbl(1270, EN[1] + 42, 80, 14)))
d.append(shape("Annotation_Start", *AN_START)); d.append(shape("Annotation_Agent", *AN_AGENT)); d.append(shape("Annotation_Tools", *AN_TOOLS))
d.append(edge("Flow_Start", [(248, CY), (295, CY)]))
d.append(edge("Flow_ToAgent", [(345, CY), (SUB[0], CY)]))
d.append(edge("Flow_ToUser", [(SUB[0] + SUB[2], CY), (UT[0], CY)]))
d.append(edge("Flow_ToSatisfied", [(UT[0] + 100, CY), (GS[0], CY)]))
d.append(edge("Flow_Yes", [(GS[0] + 50, CY), (EN[0], CY)], lbl(1252, CY - 22, 20, 14)))
d.append(edge("Flow_No", [(GS[0] + 25, CY + 25), (GS[0] + 25, 520), (GR[0] + 25, 520), (GR[0] + 25, CY + 25)], lbl(1190, 500, 20, 14)))
d.append(edge("Assoc_Start", [(ST[0] + 18, ST[1]), (ST[0] + 18, AN_START[1] + AN_START[3])]))
d.append(edge("Assoc_Agent", [(SUB[0], SUB[1] + 330), (AN_AGENT[0] + AN_AGENT[2], AN_AGENT[1] + 30)]))
jx, jy = tool_xy(tools[2])
d.append(edge("Assoc_Tools", [(jx + TW // 2 + 20, jy + TH), (AN_TOOLS[0] + 100, AN_TOOLS[1])]))
d.append('</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>')
with open(OUT, "w") as f:
    f.write(xml + "\n".join(d) + "\n")

def apply(template, eid, sets):
    cmd = ["c8ctl", "element-template", "apply", "-i", template, eid, OUT]
    for k, v in sets:
        cmd += ["--set", f"{k}={v}"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"apply {eid} failed: {r.stdout}{r.stderr}")

apply("io.camunda.connectors.agenticai.ai-agent-subprocess.v2", "AI_Agent", [
  ("provider.type", "openai"),
  ("provider.openai.api.type", "responses"),
  ("provider.openai.backend.type", "custom"),
  ("provider.openai.backend.custom.endpoint", "=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_ENDPOINT"),
  ("provider.openai.backend.custom.authentication.type", "apiKey"),
  ("provider.openai.backend.custom.authentication.apiKey", "=camunda.secrets.CAMUNDA_PROVIDED_LLM_API_KEY"),
  ("provider.openai.model.model", "=camunda.secrets.CAMUNDA_PROVIDED_LLM_DEFAULT_MODEL"),
  ("data.systemPrompt.prompt", SYS),
  ("data.userPrompt.prompt", "=if is defined(followUpInput) then followUpInput else inputText"),
  ("data.userPrompt.documents", "=if is defined(followUpInput) or is defined(followUpDocuments) then followUpDocuments else inputDocuments"),
  ("agentContext", "=agent.context"),
  ("data.memory.storage.type", "in-process"),
  ("data.memory.contextWindowSize", "20"),
  ("data.limits.maxModelCalls", "10"),
  ("data.events.behavior", "WAIT_FOR_TOOL_CALL_RESULTS"),
  ("data.response.format.type", "text"),
  ("data.response.format.parseJson", "false"),
  ("data.response.includeAssistantMessage", "false"),
  ("data.response.includeAgentContext", "true"),
  ("retries", "3"),
  ("retryBackoff", "PT0S"),
])
for t in tools:
    s = [("authentication.type", "noAuth"), ("method", "GET"), ("url", t["url"]),
         ("connectionTimeoutInSeconds", "20"), ("readTimeoutInSeconds", "20"),
         ("ignoreNullValues", "false"), ("resultExpression", t["res"]),
         ("retries", "3"), ("retryBackoff", "PT0S")]
    if "qp" in t: s.append(("queryParameters", t["qp"]))
    if "fmt" in t: s.append(("documentReturnFormat.choice", t["fmt"]))
    apply("io.camunda.connectors.HttpJson.v2", t["id"], s)
