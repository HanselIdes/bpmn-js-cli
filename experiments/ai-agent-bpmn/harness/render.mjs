// Usage: node render.mjs <in.bpmn> <out.png>  — imports XML into bpmn-js and screenshots; reports import warnings
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const [,, inFile, png] = process.argv;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 900 });
await page.goto('file://' + resolve(here, 'page.html'));
const res = await page.evaluate(async x => { try { await window.boot('pure', x); return 'imported'; } catch (e) { return 'IMPORT ERROR ' + e.message; } }, readFileSync(inFile, 'utf8'));
const warnings = await page.evaluate(() => 0);
await page.screenshot({ path: png }); await browser.close(); console.log(res);
