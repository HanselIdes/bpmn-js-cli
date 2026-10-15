#!/usr/bin/env node
/**
 * Headless bpmn-js-cli runner with Camunda 8 commands.
 *
 *   bpmn-js-cli run <script.js> --out <file.bpmn> [--in <base.bpmn>] [--png <file.png>]
 *   bpmn-js-cli template-props <templateId> [--version <n>]
 *   bpmn-js-cli help
 *
 * Options:
 *   --engine <x.y.z>        Camunda engine version for templates and executionPlatformVersion (default 8.10.0)
 *   --templates <file.json> element templates array (default: c8ctl OOTB cache)
 *   --chrome <path>         Chrome/Chromium executable (default: $CHROME_BIN or macOS Google Chrome)
 *
 * The script is plain JavaScript executed in the page with `cli` in scope.
 * It starts from an empty executable process (Process_1 with StartEvent_1)
 * unless --in is given. Errors stop the run and print the failing command.
 */
import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const cmd = argv.shift();

function opt(name, fallback) {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv.splice(i, 2)[1] : fallback;
}

const engine = opt('engine', '8.10.0');
const templatesFile = opt('templates', [
  process.env.C8CTL_TEMPLATES,
  resolve(homedir(), 'Library/Application Support/c8ctl/element-templates/templates.json'),
  resolve(homedir(), '.config/c8ctl/element-templates/templates.json')
].find(p => p && existsSync(p)));
const chrome = opt('chrome', process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');

if (!cmd || cmd === 'help' || cmd === '--help') {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n/, '').replace(/^ \* ?/gm, ''));
  process.exit(0);
}

if (!existsSync(resolve(root, 'runner/dist/bundle.js'))) {
  console.error('runner bundle missing: run `npm run build:runner` in ' + root);
  process.exit(2);
}

const templates = templatesFile ? JSON.parse(readFileSync(templatesFile, 'utf8')) : [];

async function withPage(fn) {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: [ '--allow-file-access-from-files' ] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + resolve(root, 'runner/page.html'));
    return await fn(page, errors);
  } finally {
    await browser.close();
  }
}

if (cmd === 'template-props') {
  const id = argv.shift();
  const version = opt('version');
  await withPage(async page => {
    await page.evaluate(o => window.bootCli(o), { engine, templates });
    const props = await page.evaluate((id, version) => window.cli.templateProps(id, version ? { version } : undefined), id, version);
    console.log(JSON.stringify(props, null, 2));
  }).catch(e => { console.error('ERROR ' + e.message.split('\n')[0]); process.exit(1); });
  process.exit(0);
}

if (cmd !== 'run') {
  console.error('unknown command <' + cmd + '>, see `bpmn-js-cli help`');
  process.exit(2);
}

const script = argv.shift();
const out = opt('out');
const input = opt('in');
const png = opt('png');

if (!script || !out) {
  console.error('usage: bpmn-js-cli run <script.js> --out <file.bpmn> [--in <base.bpmn>] [--png <file.png>]');
  process.exit(2);
}

const code = readFileSync(script, 'utf8');
const xmlIn = input ? readFileSync(input, 'utf8') : null;

const code_ = await withPage(async (page, errors) => {
  const warnings = await page.evaluate(o => window.bootCli(o), { engine, templates, xml: xmlIn });
  warnings.forEach(w => console.error('import warning: ' + w));

  const result = await page.evaluate(src => {
    try {
      (new Function('cli', src))(window.cli);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: String(e && e.message || e).split('\n').slice(0, 2).join(' ') };
    }
  }, code);

  if (!result.ok) {
    console.error('COMMAND ERROR ' + result.message);
    return 1;
  }

  const { xml } = await page.evaluate(() => window.modeler.saveXML({ format: true }));
  writeFileSync(out, xml);

  if (png) {
    await page.evaluate(() => {
      window.modeler.get('selection').select(null);
      window.modeler.get('canvas').zoom('fit-viewport', 'auto');
    });
    await page.screenshot({ path: png });
  }

  errors.forEach(e => console.error('page error: ' + e));
  console.log('OK wrote ' + out + (png ? ' and ' + png : ''));
  return 0;
});

process.exit(code_);
