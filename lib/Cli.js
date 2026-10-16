import {
  isArray,
  isNumber,
  isString,
  isFunction,
  forEach
} from 'min-dash';

function asArray(args) {
  return Array.prototype.slice.call(args);
}

function asParam(parse) {
  return function(name, options) {
    return {
      name: name,
      optional: !!(options && (options.optional || options.defaultValue)),
      parse: function(val) {
        return parse(val, options || {});
      }
    };
  };
}

function StringParser() {
  return function(arg, options) {

    // support variable arguments
    if (isArray(arg)) {
      arg = arg.join(' ');
    }

    if (arg !== '' && !arg) {
      if (options.defaultValue) {
        return options.defaultValue;
      } else {
        throw new Error('no value given');
      }
    } else {
      return arg;
    }
  };
}

function BooleanParser() {
  return function(arg, options) {
    if (!arg) {
      if (options.defaultValue) {
        return options.defaultValue;
      }

      if (options.optional) {
        return undefined;
      }

      throw new Error('no value given');
    } else {
      return arg && arg !== 'false';
    }
  };
}

function NumberParser() {
  return function(arg, options) {
    if (arg !== 0 && !arg) {
      if (options.defaultValue) {
        return options.defaultValue;
      } else {
        throw new Error('no value given');
      }
    } else {
      return isNumber(arg) ? arg : parseFloat(arg, 10);
    }
  };
}

/**
 * The CLI.
 *
 * @param {Object} config
 * @param {didi.Injector} injector
 */
export default function Cli(config, injector) {

  this._commands = {};
  this._params = {};

  this._injector = injector;

  this._registerParsers();
  this._registerCommands();

  this._bind(config);
}

Cli.$inject = [
  'config',
  'injector'
];


// reset prototype (ain't gonna inherit from object)

Cli.prototype = {};


// helpers //////////////////////////

Cli.prototype._bind = function(config) {
  if (config.cli && config.cli.bindTo) {
    console.info('bpmn-js-cli is available via window.' + config.cli.bindTo);
    window[config.cli.bindTo] = this;
  }
};

Cli.prototype._registerParser = function(name, Parser) {
  var parser = this._injector.invoke(Parser);

  // must return a function(val, options) -> result
  if (!isFunction(parser)) {
    throw new Error(
      'parser must be a Function<String, Object> -> Object'
    );
  }

  this._params[name] = asParam(parser);
};

Cli.prototype._registerCommand = function(name, Command) {

  var command = (
    isFunction(Command) ?
      this._injector.invoke(Command) :
      Command
  );

  command.args = command.args || [];

  this._commands[name] = command;

  var self = this;

  this[name] = function() {
    var args = asArray(arguments);
    args.unshift(name);

    return self.exec.apply(self, args);
  };
};

Cli.prototype._registerParsers = function() {
  this._registerParser('string', StringParser);
  this._registerParser('number', NumberParser);
  this._registerParser('bool', BooleanParser);
};

Cli.prototype._registerCommands = function() {

  var self = this;

  // special <help> command
  this._registerCommand('help', {
    raw: true,
    description: 'list commands, or show the arguments and options of one command',
    args: [ { name: 'command', optional: true, parse: function(val) { return val; } } ],
    exec: function(name) {
      return name ? self.helpFor(name) : self.helpAll();
    }
  });
};

Cli.prototype.helpAll = function() {
  var help = 'available commands:\n';

  forEach(this._commands, function(c, name) {
    help += '\n\t' + name + (c.description ? ' - ' + c.description : '');
  });

  return help + '\n\nrun help <command> for its arguments and options';
};

Cli.prototype.helpFor = function(name) {
  var command = this._commands[name];

  if (!command) {
    throw new Error('no command <' + name + '>, run help to list the available commands');
  }

  var usage = name + command.args.map(function(a) {
    return a.optional ? ' [' + a.name + ']' : ' <' + a.name + '>';
  }).join('');

  var help = usage;

  if (command.description) {
    help += '\n\n' + command.description;
  }

  if (command.options) {
    help += '\n\noptions:\n';

    forEach(command.options, function(text, key) {
      help += '\n\t' + key + ': ' + text;
    });
  }

  return help + '\n';
};

Cli.prototype.parseArguments = function(args, command) {

  var results = [];

  var last = command.args.length - 1;

  forEach(command.args, function(c, i) {

    var val;

    // last arg receives array of all remaining parameters
    if (i === last && args.length > command.args.length) {
      val = args.slice(i);
    } else {
      val = args[i];
    }

    try {
      results.push(c.parse(val));
    } catch (e) {
      throw new Error('could not parse <' + c.name + '>: ' + e.message);
    }
  });

  return results;
};

Cli.prototype.exec = function() {

  var args = [];

  var rawCommand = this._commands[arguments[0]];

  if (rawCommand && rawCommand.raw) {

    // raw commands receive their arguments verbatim, so string values
    // such as labels, prompts, or FEEL expressions may contain whitespace
    args = asArray(arguments);
  } else {

    // convert mixed whitespace separated string / object assignments in args list
    // to correct argument representation
    asArray(arguments).forEach(function(arg) {
      if (isString(arg)) {
        args = args.concat(arg.split(/\s+/));
      } else {
        args.push(arg);
      }
    });
  }

  var name = args.shift();

  var command = this._commands[name];
  if (!command) {
    throw new Error(
      'no command <' + name + '>, ' +
      'execute <commands> to get a list of available commands'
    );
  }

  var values, result;

  try {
    values = this.parseArguments(args, command);
    result = command.exec.apply(this, values);
  } catch (e) {
    throw new Error(
      'failed to execute <' + name + '> ' +
      'with args <[' + args.join(', ') + ']> : ' +
      e.stack
    );
  }

  return result;
};