> As of version `1.0.0` this library exposes [ES modules](http://exploringjs.com/es6/ch_modules.html#sec_basics-of-es6-modules). Use an ES module aware bundler such as [Webpack](https://webpack.js.org) or [Rollup](https://rollupjs.org) to bundle it for the browser.

# bpmn-js-cli

[![CI](https://github.com/bpmn-io/bpmn-js-cli/workflows/CI/badge.svg)](https://github.com/bpmn-io/bpmn-js-cli/actions?query=workflow%3ACI)

An extensible command line interface for [bpmn-js](https://github.com/bpmn-io/bpmn-js).


## Demo

<img src="./resources/screencast.gif" style="max-width: 100%" />

Checkout [`demo.js`](./resources/demo.js) for the commands powering this demo.


## Features

* Model BPMN 2.0 diagrams in the browser, without a mouse
* Full undo and redo functionality
* Extensible through your own commands
* [Numerous built-in commands](#built-in-commands)


## Built in Commands

Run `cli.help()` to list commands and `cli.help('annotate')` for one command's
arguments and options. The headless runner offers the same as `bin/bpmn-js-cli.mjs help [command]`.

Out of the box, the cli supports the following commands:

 * `append source type [deltaPos] [flowId]`: returns the new element id; `flowId` names the new sequence flow (give `deltaPos` too, default `200,0`)
 * `connect source target type [parent] [flowId]`: returns the connection id; `flowId` names it (`-` as `parent` keeps the default parent)
 * `create type position parent`
 * `element id`
 * `elements`
 * `move shape delta [newParentId]`
 * `undo`
 * `redo`
 * `save svg|bpmn`
 * `setLabel element label`
 * `setRoot element|elementId`
 * `removeShape  shape|elementId`
 * `removeConnection  connection|connectionId`


## Camunda 8 commands

This fork adds commands that make a diagram executable on Camunda 8 (Zeebe), plus a
headless runner. Register `lib/camunda` after the cli module, together with the
`zeebe` moddle extension. The `template` commands also need `CloudElementTemplatesCoreModule`
from `bpmn-js-element-templates`.

These commands take their arguments verbatim, so names, prompts and FEEL expressions
may contain spaces. Upstream commands keep splitting string arguments on whitespace.

| Command                                         | Effect                                                                                         |
|-------------------------------------------------|------------------------------------------------------------------------------------------------|
| `set(id, attrs)`                                | Update attributes on a shape, connection or the process, e.g. `{ id, name }`                   |
| `definitions(attrs)`                            | Update `bpmn:Definitions`, e.g. `{ 'modeler:executionPlatformVersion': '8.10.0' }`             |
| `zeebe(id, type, attrs?)`                       | Add or update one zeebe extension, e.g. `zeebe(id, 'zeebe:FormDefinition', { formId })`       |
| `input(id, target, source)`                     | Insert or replace a `zeebe:input`, keyed by target                                             |
| `output(id, target, source)`                    | Insert or replace a `zeebe:output`, keyed by target                                            |
| `header(id, key, value)`                        | Insert or replace a `zeebe:header`                                                             |
| `property(id, name, value)`                     | Insert or replace a `zeebe:property`                                                           |
| `condition(flowId, expression)`                 | Set a sequence flow condition, e.g. `'=amount > 1000'`                                         |
| `defaultFlow(gatewayId, flowId)`                | Set a gateway's default flow                                                                   |
| `doc(id, text)`                                 | Set the element documentation                                                                  |
| `replace(id, type, options?)`                   | Replace an element, e.g. `replace(id, 'bpmn:AdHocSubProcess', { isExpanded: true })`; returns the new id. Options below |
| `resize(id, bounds)`                            | Resize a shape. Bounds below                                                                   |
| `waypoints(id, points)`                         | Route a connection through explicit points, `[[x, y], ...]` or `[{ x, y }, ...]`; first and last sit on the source and target borders |
| `annotate(id, text, options?)`                  | Add a text annotation with an association; returns the annotation id. Options below            |
| `template(id, templateId, values?, options?)`   | Apply an element template, then write `values` by template property id; returns the new id. Options below |
| `templateProps(templateId, options?)`           | List a template's settable properties: id, type, default, choices, condition. Options below   |
| `describe(id)`                                  | Return a JSON summary of an element: type, name, flows, condition, extensions                  |

### Options

Commands that take an options or bounds object accept these keys. Anything else is ignored,
except for `replace`, which passes other keys to the new element.

| Command         | Key             | Meaning                                                                                  |
|-----------------|-----------------|------------------------------------------------------------------------------------------|
| `annotate`      | `id`            | Id for the annotation                                                                    |
| `annotate`      | `associationId` | Id for the association                                                                   |
| `annotate`      | `dx`            | Horizontal offset from the element center, default 0                                     |
| `annotate`      | `dy`            | Vertical offset from the element top, default -60 (above the element)                    |
| `annotate`      | `width`         | Annotation width, default 100                                                            |
| `annotate`      | `height`        | Annotation height, default 30                                                            |
| `annotate`      | `parent`        | Parent element or id; default the element's parent. Use a sub-process id to place it inside |
| `annotate`      | `reverse`       | `true` draws the association from the annotation to the element                          |
| `replace`       | `isExpanded`    | `true` expands a collapsed sub-process in place, `false` collapses it                    |
| `replace`       | other keys      | Applied to the new element, e.g. `isInterrupting`, `eventDefinitionType`                 |
| `template`      | `values` (3rd argument) | Object of template property id to value; `null` or `''` removes the binding      |
| `template`      | `version` (key of the 4th argument) | Template version, default the latest compatible                      |
| `templateProps` | `version`       | Template version, default the latest compatible                                          |
| `templateProps` | `filter`        | Keep properties whose id contains this text (case-insensitive) or matches a glob such as `data.*Prompt*` |
| `templateProps` | `condensed`     | `true` returns one text line per property: `id \| type \| default \| condition`, with defaults cut at 60 characters |
| `resize`        | `width`, `height` | New size, default unchanged                                                            |
| `resize`        | `x`, `y`        | New top-left corner, default unchanged                                                   |

### Flow ids

`append` and `connect` take an optional last argument that names the sequence flow they create,
so you do not need to look up its generated id:

```js
cli.append('StartEvent_1', 'bpmn:UserTask', '200,0', 'Flow_StartToReview');
cli.connect('Gateway_UserSatisfied', 'Gateway_RunAgent', 'bpmn:SequenceFlow', '-', 'Flow_No');
```

### Template properties

`template-props` and `templateProps` list every settable property, about 150 for the AI Agent
template. Narrow and shorten the list:

```sh
bin/bpmn-js-cli.mjs template-props io.camunda.connectors.agenticai.ai-agent-subprocess.v2 --filter 'data.*' --condensed
```

`--filter` takes a substring or glob on the property id and `--condensed` prints a note that unset properties keep their default, then one line per
property: `id | type | default | condition`. Both are also options of `cli.templateProps(id, { filter, condensed })`.

Applying a template already fills every property with its default, so set only the values that
differ from the default column of `templateProps`. Leaving out a default such as a 20 s timeout
or 3 retries gives the same process as writing it.

`template` writes each value through its binding exactly as given, so `'20'` stays `20`
and `'=20'` stays `=20`. It writes in passes, so a value that activates conditional
properties (such as a provider type) lets you set those properties in the same call.
It throws on unknown property ids and on values whose conditions are not met.

### Headless runner

```sh
npm run build:runner
bin/bpmn-js-cli.mjs run model.js --out process.bpmn [--in base.bpmn] [--png diagram.png] [--engine 8.10.0]
bin/bpmn-js-cli.mjs template-props io.camunda.connectors.HttpJson.v2 [--filter <text|glob>] [--condensed]
bin/bpmn-js-cli.mjs help [command]
```

`model.js` is plain JavaScript with `cli` in scope. Without `--in`, it starts from an empty
executable Camunda process (`Process_1` with `StartEvent_1`). Templates load from the
c8ctl OOTB cache (run `c8ctl element-template sync` once) or from `--templates <file.json>`.
The runner needs Chrome; set `CHROME_BIN` if it is not in the default macOS location.


## Quickstart

Get the list of available commands:

```
cli.help();
```

Get the list of elements:

```
cli.elements();
```

Export SVG or BPMN 2.0 xml

```
cli.save('svg' || 'bpmn');
```


## Usage

Deploy the cli with [bpmn-js](https://github.com/bpmn-io/bpmn-js):

```
var BpmnModeler = require('bpmn-js/lib/Modeler'),
    CliModule = require('bpmn-js-cli');

var modeler = new BpmnModeler({
  container: document.body,
  additionalModules: [
    CliModule
  ],
  cli: {
    bindTo: 'cli'
  }
});

modeler.importXML('some-bpmn-xml')
  .then(({ warnings }) => {
    // ...
  })
  .catch(err => {
    console.error(err);
  });
```

Access the cli as `cli` in your developer console (open via `F12` in most browsers).

Use the cli to model BPMN 2.0 diagrams in your browser. Pain free.


## License

MIT
