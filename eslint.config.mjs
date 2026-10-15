import bpmnIoPlugin from 'eslint-plugin-bpmn-io';

export default [
  {
    ignores: [ 'runner/dist/**' ]
  },
  ...bpmnIoPlugin.configs.browser,
  ...bpmnIoPlugin.configs.node.map(config => {
    return {
      ...config,
      files: [
        'karma.conf.js',
        'bin/**/*.mjs',
        '**/test/**/*.js'
      ]
    };
  }),
  ...bpmnIoPlugin.configs.mocha.map(config => {
    return {
      ...config,
      files: [
        '**/test/**/*.js'
      ]
    };
  })
];
