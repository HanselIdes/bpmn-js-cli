import {
  assign,
  forEach,
  isString
} from 'min-dash';

import {
  getBusinessObject,
  is
} from 'bpmn-js/lib/util/ModelUtil';


/**
 * Commands that make a diagram executable on Camunda 8 (Zeebe).
 *
 * All commands are registered as `raw`: their arguments are passed
 * verbatim, so names, prompts, and FEEL expressions may contain spaces.
 */

function any(name, options) {
  return {
    name: name,
    parse: function(val) {
      if (val === undefined && !(options && options.optional)) {
        throw new Error('no value given');
      }

      return val;
    }
  };
}

function getExtensionElements(bo, moddle) {
  var extensionElements = bo.get('extensionElements');

  if (!extensionElements) {
    extensionElements = moddle.create('bpmn:ExtensionElements', { values: [] });
    extensionElements.$parent = bo;
  }

  return extensionElements;
}

function findExtension(bo, type) {
  var extensionElements = bo.get('extensionElements');

  return extensionElements && extensionElements.get('values').filter(function(value) {
    return is(value, type);
  })[0];
}

/**
 * Ensure a zeebe extension element of the given type exists on the element.
 * Returns the extension element.
 */
function ensureExtension(element, type, modeling, moddle) {
  var bo = getBusinessObject(element);

  var existing = findExtension(bo, type);

  if (existing) {
    return existing;
  }

  var extensionElements = getExtensionElements(bo, moddle);

  var extension = moddle.create(type);
  extension.$parent = extensionElements;

  modeling.updateModdleProperties(element, extensionElements, {
    values: extensionElements.get('values').concat(extension)
  });

  if (!bo.get('extensionElements')) {
    modeling.updateProperties(element, { extensionElements: extensionElements });
  }

  return extension;
}

/**
 * Insert or replace an entry in a list held by a zeebe extension element,
 * matched by key attribute (e.g. target for zeebe:Input).
 */
function upsertEntry(element, containerType, listName, entryType, keyAttr, attrs, modeling, moddle) {
  var container = ensureExtension(element, containerType, modeling, moddle);

  var entries = (container.get(listName) || []).filter(function(entry) {
    return entry.get(keyAttr) !== attrs[keyAttr];
  });

  var entry = moddle.create(entryType, attrs);
  entry.$parent = container;

  var update = {};
  update[listName] = entries.concat(entry);

  modeling.updateModdleProperties(element, container, update);

  return entry;
}

function describe(element) {
  var bo = getBusinessObject(element);

  var result = {
    id: bo.id,
    type: bo.$type,
    name: bo.name
  };

  if (bo.sourceRef) {
    result.source = bo.sourceRef.id;
    result.target = bo.targetRef.id;
  }

  if (bo.conditionExpression) {
    result.condition = bo.conditionExpression.body;
  }

  if (bo.default) {
    result.default = bo.default.id;
  }

  if (bo.documentation && bo.documentation.length) {
    result.documentation = bo.documentation[0].text;
  }

  if (bo.get('zeebe:modelerTemplate')) {
    result.template = bo.get('zeebe:modelerTemplate') + '@' + bo.get('zeebe:modelerTemplateVersion');
  }

  var extensionElements = bo.get('extensionElements');

  if (extensionElements) {
    result.zeebe = extensionElements.get('values').map(function(value) {
      var json = { $type: value.$type };

      forEach(value.$attrs, function(v, k) {
        json[k] = v;
      });

      forEach(value.$descriptor.properties, function(p) {
        var v = value.get(p.name);

        if (v === undefined || (Array.isArray(v) && !v.length)) {
          return;
        }

        json[p.name] = Array.isArray(v) ? v.map(function(entry) {
          var e = {};

          entry.$descriptor.properties.forEach(function(ep) {
            if (entry.get(ep.name) !== undefined) {
              e[ep.name] = entry.get(ep.name);
            }
          });

          return e;
        }) : v;
      });

      return json;
    });
  }

  return result;
}


export function SetCommand(params, modeling) {
  return {
    raw: true,
    args: [ params.element('element'), any('attrs') ],
    exec: function(element, attrs) {
      modeling.updateProperties(element, attrs);

      return element.id;
    }
  };
}

SetCommand.$inject = [ 'cli._params', 'modeling' ];


export function DefinitionsCommand(canvas, commandStack) {
  return {
    raw: true,
    args: [ any('attrs') ],
    exec: function(attrs) {
      var definitions = getBusinessObject(canvas.getRootElement()).$parent;

      // unprefixed names must be real bpmn:Definitions properties, otherwise
      // they serialize as invalid attributes, e.g. use modeler:executionPlatformVersion
      forEach(attrs, function(value, key) {
        if (key.indexOf(':') === -1 && !definitions.$descriptor.propertiesByName[key]) {
          throw new Error('<' + key + '> is not a bpmn:Definitions property; use a prefixed name such as modeler:' + key);
        }
      });

      // use a command so undo / redo work
      commandStack.execute('element.updateModdleProperties', {
        element: canvas.getRootElement(),
        moddleElement: definitions,
        properties: attrs
      });

      return definitions.id;
    }
  };
}

DefinitionsCommand.$inject = [ 'canvas', 'commandStack' ];


export function ZeebeCommand(params, modeling, moddle) {
  return {
    raw: true,
    args: [ params.element('element'), any('type'), any('attrs', { optional: true }) ],
    exec: function(element, type, attrs) {
      var extension = ensureExtension(element, type, modeling, moddle);

      if (attrs) {
        modeling.updateModdleProperties(element, extension, attrs);
      }

      return element.id;
    }
  };
}

ZeebeCommand.$inject = [ 'cli._params', 'modeling', 'moddle' ];


export function InputCommand(params, modeling, moddle) {
  return {
    raw: true,
    args: [ params.element('element'), any('target'), any('source') ],
    exec: function(element, target, source) {
      upsertEntry(element, 'zeebe:IoMapping', 'inputParameters', 'zeebe:Input', 'target',
        { source: source, target: target }, modeling, moddle);

      return element.id;
    }
  };
}

InputCommand.$inject = [ 'cli._params', 'modeling', 'moddle' ];


export function OutputCommand(params, modeling, moddle) {
  return {
    raw: true,
    args: [ params.element('element'), any('target'), any('source') ],
    exec: function(element, target, source) {
      upsertEntry(element, 'zeebe:IoMapping', 'outputParameters', 'zeebe:Output', 'target',
        { source: source, target: target }, modeling, moddle);

      return element.id;
    }
  };
}

OutputCommand.$inject = [ 'cli._params', 'modeling', 'moddle' ];


export function HeaderCommand(params, modeling, moddle) {
  return {
    raw: true,
    args: [ params.element('element'), any('key'), any('value') ],
    exec: function(element, key, value) {
      upsertEntry(element, 'zeebe:TaskHeaders', 'values', 'zeebe:Header', 'key',
        { key: key, value: value }, modeling, moddle);

      return element.id;
    }
  };
}

HeaderCommand.$inject = [ 'cli._params', 'modeling', 'moddle' ];


export function PropertyCommand(params, modeling, moddle) {
  return {
    raw: true,
    args: [ params.element('element'), any('name'), any('value') ],
    exec: function(element, name, value) {
      upsertEntry(element, 'zeebe:Properties', 'properties', 'zeebe:Property', 'name',
        { name: name, value: value }, modeling, moddle);

      return element.id;
    }
  };
}

PropertyCommand.$inject = [ 'cli._params', 'modeling', 'moddle' ];


export function ConditionCommand(params, modeling, moddle) {
  return {
    raw: true,
    args: [ params.element('flow'), any('expression') ],
    exec: function(flow, expression) {
      if (!is(flow, 'bpmn:SequenceFlow')) {
        throw new Error('element <' + flow.id + '> is not a sequence flow');
      }

      modeling.updateProperties(flow, {
        conditionExpression: expression ? moddle.create('bpmn:FormalExpression', { body: expression }) : undefined
      });

      return flow.id;
    }
  };
}

ConditionCommand.$inject = [ 'cli._params', 'modeling', 'moddle' ];


export function DefaultFlowCommand(params, modeling) {
  return {
    raw: true,
    args: [ params.element('gateway'), params.element('flow') ],
    exec: function(gateway, flow) {
      modeling.updateProperties(gateway, { 'default': getBusinessObject(flow) });

      return gateway.id;
    }
  };
}

DefaultFlowCommand.$inject = [ 'cli._params', 'modeling' ];


export function DocCommand(params, modeling, moddle) {
  return {
    raw: true,
    args: [ params.element('element'), any('text') ],
    exec: function(element, text) {
      modeling.updateProperties(element, {
        documentation: text ? [ moddle.create('bpmn:Documentation', { text: text }) ] : []
      });

      return element.id;
    }
  };
}

DocCommand.$inject = [ 'cli._params', 'modeling', 'moddle' ];


export function ReplaceCommand(params, bpmnReplace, modeling) {
  return {
    raw: true,
    args: [ params.shape('element'), any('type'), any('options', { optional: true }) ],
    exec: function(element, type, options) {
      options = options || {};

      var target = assign({ type: type }, options);

      var replaced = bpmnReplace.replaceElement(element, target);

      // bpmnReplace keeps a collapsed sub-process collapsed, so honor
      // isExpanded explicitly; expanding moves children onto the main plane
      if (options.isExpanded !== undefined && !!replaced.collapsed === !!options.isExpanded) {
        modeling.toggleCollapse(replaced);
      }

      return replaced.id;
    }
  };
}

ReplaceCommand.$inject = [ 'cli._params', 'bpmnReplace', 'modeling' ];


export function WaypointsCommand(params, modeling) {
  return {
    raw: true,
    args: [ params.element('connection'), any('points') ],
    exec: function(connection, points) {
      if (!connection.waypoints) {
        throw new Error('element <' + connection.id + '> is not a connection');
      }

      modeling.updateWaypoints(connection, points.map(function(p) {
        return Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y };
      }));

      return connection.id;
    }
  };
}

WaypointsCommand.$inject = [ 'cli._params', 'modeling' ];


export function AnnotateCommand(params, modeling, elementFactory, elementRegistry) {
  return {
    raw: true,
    args: [ params.element('element'), any('text'), any('options', { optional: true }) ],
    exec: function(element, text, options) {
      options = options || {};

      var width = options.width || 100,
          height = options.height || 30;

      var position = {
        x: element.x + element.width / 2 + (options.dx || 0),
        y: element.y + (options.dy === undefined ? -60 : options.dy)
      };

      var shape = elementFactory.createShape({
        type: 'bpmn:TextAnnotation',
        width: width,
        height: height
      });

      var parent = isString(options.parent) ? elementRegistry.get(options.parent) : options.parent;

      if (options.parent && !parent) {
        throw new Error('parent <' + options.parent + '> does not exist');
      }

      parent = parent || element.parent;

      var annotation = modeling.createShape(shape, position, parent);

      // pass bounds, otherwise the label update re-fits the annotation to its text
      modeling.updateLabel(annotation, text, {
        x: annotation.x,
        y: annotation.y,
        width: width,
        height: height
      });

      if (options.id) {
        modeling.updateProperties(annotation, { id: options.id });
      }

      var association = options.reverse ?
        modeling.connect(annotation, element, { type: 'bpmn:Association' }) :
        modeling.connect(element, annotation, { type: 'bpmn:Association' });

      if (options.associationId) {
        modeling.updateProperties(association, { id: options.associationId });
      }

      return annotation.id;
    }
  };
}

AnnotateCommand.$inject = [ 'cli._params', 'modeling', 'elementFactory', 'elementRegistry' ];


function findTemplate(elementTemplates, templateId, version) {
  var templates = elementTemplates.getAll(templateId) || [];

  if (version !== undefined) {
    templates = templates.filter(function(t) {
      return String(t.version) === String(version);
    });
  } else {
    templates = elementTemplates.getLatest(templateId) || [];
  }

  var template = templates[0];

  if (!template) {
    throw new Error('no compatible template <' + templateId + (version !== undefined ? '@' + version : '') + '> loaded');
  }

  return template;
}

function removeEntry(element, containerType, listName, keyAttr, key, modeling) {
  var container = findExtension(getBusinessObject(element), containerType);

  if (!container) {
    return;
  }

  var entries = container.get(listName) || [];
  var remaining = entries.filter(function(entry) {
    return entry.get(keyAttr) !== key;
  });

  if (remaining.length !== entries.length) {
    var update = {};
    update[listName] = remaining;
    modeling.updateModdleProperties(element, container, update);
  }
}

function readBinding(element, binding) {
  var bo = getBusinessObject(element);
  var type = binding.type;

  function entry(containerType, listName, keyAttr, key, valueAttr) {
    var container = findExtension(bo, containerType);
    var match = container && (container.get(listName) || []).filter(function(e) {
      return e.get(keyAttr) === key;
    })[0];

    return match ? match.get(valueAttr) : undefined;
  }

  if (type === 'zeebe:input') {
    return entry('zeebe:IoMapping', 'inputParameters', 'target', binding.name, 'source');
  }

  if (type === 'zeebe:output') {
    return entry('zeebe:IoMapping', 'outputParameters', 'source', binding.source, 'target');
  }

  if (type === 'zeebe:taskHeader') {
    return entry('zeebe:TaskHeaders', 'values', 'key', binding.key, 'value');
  }

  if (type === 'zeebe:property') {
    return entry('zeebe:Properties', 'properties', 'name', binding.name, 'value');
  }

  if (type === 'property') {
    return bo.get(binding.name);
  }

  var extensionTypes = {
    'zeebe:taskDefinition': 'zeebe:TaskDefinition',
    'zeebe:adHoc': 'zeebe:AdHoc',
    'zeebe:agentDefinition': 'zeebe:AgentDefinition'
  };

  if (extensionTypes[type]) {
    var extension = findExtension(bo, extensionTypes[type]);

    return extension && extension.get(binding.property);
  }

  throw new Error('unsupported template binding <' + type + '>');
}

function writeBinding(element, binding, value, modeling, moddle) {
  var type = binding.type;
  var remove = value === null || value === '';

  if (type === 'zeebe:input') {
    return remove ?
      removeEntry(element, 'zeebe:IoMapping', 'inputParameters', 'target', binding.name, modeling) :
      upsertEntry(element, 'zeebe:IoMapping', 'inputParameters', 'zeebe:Input', 'target',
        { source: String(value), target: binding.name }, modeling, moddle);
  }

  if (type === 'zeebe:output') {
    return remove ?
      removeEntry(element, 'zeebe:IoMapping', 'outputParameters', 'source', binding.source, modeling) :
      upsertEntry(element, 'zeebe:IoMapping', 'outputParameters', 'zeebe:Output', 'source',
        { source: binding.source, target: String(value) }, modeling, moddle);
  }

  if (type === 'zeebe:taskHeader') {
    return remove ?
      removeEntry(element, 'zeebe:TaskHeaders', 'values', 'key', binding.key, modeling) :
      upsertEntry(element, 'zeebe:TaskHeaders', 'values', 'zeebe:Header', 'key',
        { key: binding.key, value: String(value) }, modeling, moddle);
  }

  if (type === 'zeebe:property') {
    return remove ?
      removeEntry(element, 'zeebe:Properties', 'properties', 'name', binding.name, modeling) :
      upsertEntry(element, 'zeebe:Properties', 'properties', 'zeebe:Property', 'name',
        { name: binding.name, value: String(value) }, modeling, moddle);
  }

  if (type === 'property') {
    var attrs = {};
    attrs[binding.name] = remove ? undefined : value;

    return modeling.updateProperties(element, attrs);
  }

  var extensionTypes = {
    'zeebe:taskDefinition': 'zeebe:TaskDefinition',
    'zeebe:adHoc': 'zeebe:AdHoc',
    'zeebe:agentDefinition': 'zeebe:AgentDefinition'
  };

  if (extensionTypes[type]) {
    var extension = ensureExtension(element, extensionTypes[type], modeling, moddle);
    var update = {};
    update[binding.property] = remove ? undefined : String(value);

    return modeling.updateModdleProperties(element, extension, update);
  }

  throw new Error('unsupported template binding <' + type + '>');
}

/**
 * Apply an element template, then set property values by template property id.
 *
 *   cli.template('Task_1', 'io.camunda.connectors.HttpJson.v2', { url: 'https://...', method: 'GET' })
 *
 * Values are written through each property's binding exactly as given
 * (so `'20'` stays `20` and `'=20'` stays `=20`). Writes run in passes so
 * that conditional properties revealed by an earlier value (e.g. provider
 * specific settings) can be set too. `null` or `''` removes a binding.
 */
export function TemplateCommand(params, elementTemplates, modeling, moddle, elementRegistry) {
  return {
    raw: true,
    args: [ params.element('element'), any('templateId'), any('values', { optional: true }), any('options', { optional: true }) ],
    exec: function(element, templateId, values, options) {
      options = options || {};
      values = values || {};

      var template = findTemplate(elementTemplates, templateId, options.version);

      var unknown = Object.keys(values).filter(function(id) {
        return !template.properties.some(function(p) {
          return p.id === id;
        });
      });

      if (unknown.length) {
        throw new Error('template <' + templateId + '> has no properties with id: ' + unknown.join(', ') +
          ' (use cli.templateProps to list them)');
      }

      var id = elementTemplates.applyTemplate(element, template).id;

      var pending = Object.keys(values);

      for (var pass = 0; pass < 5 && pending.length; pass++) {
        pending = pending.filter(function(propertyId) {
          var current = elementRegistry.get(id);
          var candidates = template.properties.filter(function(p) {
            return p.id === propertyId && elementTemplates.isConditionMet(current, template.properties, p);
          });

          if (!candidates.length) {
            return true;
          }

          candidates.forEach(function(p) {
            var value = values[propertyId];

            if (readBinding(current, p.binding) !== (value === null ? undefined : String(value))) {
              writeBinding(current, p.binding, value, modeling, moddle);
            }
          });

          return false;
        });
      }

      if (pending.length) {
        throw new Error('template <' + templateId + '> properties not active because their conditions are not met: ' +
          pending.join(', ') + ' (check conditions with cli.templateProps; to write a binding anyway use cli.input / cli.header after applying)');
      }

      return id;
    }
  };
}

TemplateCommand.$inject = [ 'cli._params', 'elementTemplates', 'modeling', 'moddle', 'elementRegistry' ];


/**
 * List settable properties of a template: id, label, type, binding, default, choices, condition.
 */
export function TemplatePropsCommand(elementTemplates) {
  return {
    raw: true,
    args: [ any('templateId'), any('options', { optional: true }) ],
    exec: function(templateId, options) {
      options = options || {};

      var template = findTemplate(elementTemplates, templateId, options.version);

      return {
        id: template.id,
        version: template.version,
        appliesTo: template.appliesTo,
        elementType: template.elementType && template.elementType.value,
        properties: template.properties.filter(function(p) {
          return p.id && p.type !== 'Hidden';
        }).map(function(p) {
          var out = { id: p.id, label: p.label, type: p.type, binding: p.binding.name || p.binding.key || p.binding.property };

          if (p.value !== undefined) {
            out.default = p.value;
          }

          if (p.choices) {
            out.choices = p.choices.map(function(c) {
              return c.value;
            });
          }

          if (p.condition) {
            out.condition = p.condition;
          }

          if (p.feel) {
            out.feel = p.feel;
          }

          if (p.constraints && p.constraints.notEmpty) {
            out.required = true;
          }

          return out;
        })
      };
    }
  };
}

TemplatePropsCommand.$inject = [ 'elementTemplates' ];


export function ResizeCommand(params, modeling) {
  return {
    raw: true,
    args: [ params.shape('shape'), any('bounds') ],
    exec: function(shape, bounds) {
      modeling.resizeShape(shape, {
        x: bounds.x === undefined ? shape.x : bounds.x,
        y: bounds.y === undefined ? shape.y : bounds.y,
        width: bounds.width || shape.width,
        height: bounds.height || shape.height
      });

      return shape.id;
    }
  };
}

ResizeCommand.$inject = [ 'cli._params', 'modeling' ];


export function DescribeCommand(params) {
  return {
    raw: true,
    args: [ params.element('element') ],
    exec: function(element) {
      return describe(element);
    }
  };
}

DescribeCommand.$inject = [ 'cli._params' ];

