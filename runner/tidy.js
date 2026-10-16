import { is } from 'bpmn-js/lib/util/ModelUtil';
import { isExpanded } from 'bpmn-js/lib/util/DiUtil';

/**
 * Post-processing for bpmn-auto-layout, which drops text annotations, stacks the
 * unconnected children of a sub-process in one column and leaves loop-backs crossing
 * the diagram. These steps use general rules only: no diagram-specific coordinates.
 */

var GAP_X = 70,
    GAP_Y = 60,
    PADDING = 40,
    LOOP_CLEARANCE = 40,
    ANNOTATION_DISTANCE = 40;

function shapesOf(elementRegistry, filter) {
  return elementRegistry.filter(function(e) {
    return !e.waypoints && !e.labelTarget && e.parent && filter(e);
  });
}

function overlaps(a, b, pad) {
  pad = pad || 0;

  return a.x < b.x + b.width + pad && a.x + a.width + pad > b.x &&
    a.y < b.y + b.height + pad && a.y + a.height + pad > b.y;
}

function hitsPath(rect, waypoints) {
  for (var i = 1; i < waypoints.length; i++) {
    var a = waypoints[i - 1], b = waypoints[i];
    var steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 5));

    for (var s = 0; s <= steps; s++) {
      var p = { x: a.x + (b.x - a.x) * s / steps, y: a.y + (b.y - a.y) * s / steps };

      if (p.x > rect.x && p.x < rect.x + rect.width && p.y > rect.y && p.y < rect.y + rect.height) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Remove every text annotation (with its association) and return what is needed to re-create it.
 */
export function captureAnnotations(modeler) {
  var elementRegistry = modeler.get('elementRegistry'),
      modeling = modeler.get('modeling');

  var saved = [];

  shapesOf(elementRegistry, function(e) {
    return is(e, 'bpmn:TextAnnotation');
  }).forEach(function(annotation) {
    var association = elementRegistry.filter(function(e) {
      return e.waypoints && is(e, 'bpmn:Association') && (e.source === annotation || e.target === annotation);
    })[0];

    if (!association) {
      return;
    }

    var reverse = association.source === annotation;
    var anchor = reverse ? association.target : association.source;

    // 100 x 30 is the command default, so treat it as "not sized"
    var sized = !(annotation.width === 100 && annotation.height === 30);

    saved.push({
      id: annotation.id,
      associationId: association.id,
      anchorId: anchor.id,
      reverse: reverse,
      text: annotation.businessObject.text,
      width: sized ? annotation.width : null,
      height: sized ? annotation.height : null
    });
  });

  saved.forEach(function(s) {
    modeling.removeElements([ elementRegistry.get(s.id) ]);
  });

  return saved;
}

function bounds(e) {
  return { x: e.x, y: e.y, width: e.width, height: e.height };
}

function center(e) {
  return { x: e.x + e.width / 2, y: e.y + e.height / 2 };
}

function isExpandedSubProcess(e) {
  return is(e, 'bpmn:SubProcess') && isExpanded(e);
}

function arrangeSubProcess(modeler, sub) {
  var elementRegistry = modeler.get('elementRegistry'),
      modeling = modeler.get('modeling');

  var children = shapesOf(elementRegistry, function(e) {
    return e.parent === sub && !is(e, 'bpmn:TextAnnotation');
  });

  var loose = children.filter(function(c) {
    return !(c.incoming && c.incoming.length) && !(c.outgoing && c.outgoing.length);
  });

  if (loose.length < 2 || loose.length !== children.length) {
    return;
  }

  var columns = loose.length <= 3 ? loose.length : Math.ceil(Math.sqrt(loose.length));
  var cellWidth = Math.max.apply(null, loose.map(function(c) { return c.width; })) + GAP_X;
  var cellHeight = Math.max.apply(null, loose.map(function(c) { return c.height; })) + GAP_Y;
  var rows = Math.ceil(loose.length / columns);

  var oldRight = sub.x + sub.width;

  // keep reading order: top to bottom, then left to right, as laid out
  loose.sort(function(a, b) {
    return a.y - b.y || a.x - b.x;
  });

  loose.forEach(function(child, i) {
    var column = Math.floor(i / rows), row = i % rows;

    modeling.moveElements([ child ], {
      x: sub.x + PADDING + column * cellWidth - child.x,
      y: sub.y + PADDING + row * cellHeight - child.y
    });
  });

  // the sub-process may have grown by itself while its children moved
  modeling.resizeShape(sub, {
    x: sub.x,
    y: sub.y,
    width: columns * cellWidth - GAP_X + 2 * PADDING,
    height: rows * cellHeight - GAP_Y + 2 * PADDING + 10
  });

  var shift = sub.x + sub.width - oldRight;

  if (shift) {
    var downstream = shapesOf(elementRegistry, function(e) {
      return e.parent === sub.parent && e !== sub && !is(e, 'bpmn:TextAnnotation') && e.x >= oldRight - 1;
    });

    if (downstream.length) {
      modeling.moveElements(downstream, { x: shift, y: 0 });
    }
  }

  // the main row passes through the middle of the sub-process
  var feeder = (sub.incoming || []).filter(function(c) {
    return is(c, 'bpmn:SequenceFlow');
  })[0];

  if (feeder) {
    var dy = center(feeder.source).y - center(sub).y;

    if (dy) {
      modeling.moveElements([ sub ], { x: 0, y: dy });
    }
  }
}

function routeLoopBacks(modeler) {
  var elementRegistry = modeler.get('elementRegistry'),
      modeling = modeler.get('modeling');

  var root = modeler.get('canvas').getRootElement();

  var flows = elementRegistry.filter(function(e) {
    return e.waypoints && is(e, 'bpmn:SequenceFlow') && e.source.parent === root && e.target.parent === root &&
      center(e.target).x < center(e.source).x;
  });

  if (!flows.length) {
    return;
  }

  flows.forEach(function(flow, i) {
    var all = shapesOf(elementRegistry, function(e) {
      return e.parent === root && !is(e, 'bpmn:TextAnnotation');
    });

    var low = Math.max.apply(null, all.map(function(e) { return e.y + e.height; })) + LOOP_CLEARANCE + i * 20;
    var s = flow.source, t = flow.target;

    modeling.updateWaypoints(flow, [
      { x: center(s).x, y: s.y + s.height },
      { x: center(s).x, y: low },
      { x: center(t).x, y: low },
      { x: center(t).x, y: t.y + t.height }
    ]);
  });
}

function annotationSize(saved) {
  if (saved.width) {
    return { width: saved.width, height: saved.height };
  }

  var width = 220;
  var lines = Math.ceil((saved.text || '').length / 34);

  return { width: width, height: Math.max(40, lines * 15 + 16) };
}

function placeAnnotation(modeler, saved, taken) {
  var elementRegistry = modeler.get('elementRegistry'),
      modeling = modeler.get('modeling'),
      elementFactory = modeler.get('elementFactory');

  var anchor = elementRegistry.get(saved.anchorId);

  if (!anchor) {
    return;
  }

  var size = annotationSize(saved);
  var root = modeler.get('canvas').getRootElement();

  var obstacles = shapesOf(elementRegistry, function(e) {
    return !is(e, 'bpmn:TextAnnotation') && (e !== anchor.parent);
  }).map(bounds).concat(taken);

  // an annotation of a task inside a sub-process sits outside it
  var inside = anchor.parent !== root ? anchor.parent : null;

  if (inside) {
    obstacles.push(bounds(inside));
  }

  var paths = elementRegistry.filter(function(e) {
    return e.waypoints;
  }).map(function(e) {
    return e.waypoints;
  });

  var c = center(anchor);
  var spot = null;

  for (var d = ANNOTATION_DISTANCE; d <= ANNOTATION_DISTANCE * 6 && !spot; d += ANNOTATION_DISTANCE) {
    var candidates = [
      { x: c.x - size.width / 2, y: anchor.y - d - size.height },
      { x: c.x - size.width / 2, y: anchor.y + anchor.height + d },
      { x: anchor.x - d - size.width, y: c.y - size.height / 2 },
      { x: anchor.x + anchor.width + d, y: c.y - size.height / 2 },
      { x: anchor.x - d - size.width, y: anchor.y - d - size.height },
      { x: anchor.x + anchor.width + d, y: anchor.y - d - size.height }
    ];

    for (var i = 0; i < candidates.length && !spot; i++) {
      var rect = { x: candidates[i].x, y: candidates[i].y, width: size.width, height: size.height };

      var free = obstacles.every(function(o) {
        return !overlaps(rect, o, 8);
      }) && paths.every(function(p) {
        return !hitsPath(rect, p);
      });

      if (free) {
        spot = rect;
      }
    }
  }

  spot = spot || { x: c.x - size.width / 2, y: anchor.y - 2 * ANNOTATION_DISTANCE - size.height, width: size.width, height: size.height };

  var shape = elementFactory.createShape({ type: 'bpmn:TextAnnotation', width: size.width, height: size.height });
  var annotation = modeling.createShape(shape, { x: spot.x + spot.width / 2, y: spot.y + spot.height / 2 }, root);

  modeling.updateLabel(annotation, saved.text, bounds(annotation));
  modeling.updateProperties(annotation, { id: saved.id });

  var association = saved.reverse ?
    modeling.connect(annotation, anchor, { type: 'bpmn:Association' }) :
    modeling.connect(anchor, annotation, { type: 'bpmn:Association' });

  modeling.updateProperties(association, { id: saved.associationId });

  taken.push(bounds(annotation));
}

export function tidy(modeler, annotations) {
  var elementRegistry = modeler.get('elementRegistry');

  shapesOf(elementRegistry, isExpandedSubProcess).forEach(function(sub) {
    arrangeSubProcess(modeler, sub);
  });

  routeLoopBacks(modeler);

  var taken = [];

  annotations.forEach(function(saved) {
    placeAnnotation(modeler, saved, taken);
  });
}
