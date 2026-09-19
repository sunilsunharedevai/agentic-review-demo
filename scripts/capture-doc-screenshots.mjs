import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:5175/';
const outDir = path.resolve('docs/project-documentation/screenshots');
const debugPort = Number(process.env.CHROME_DEBUG_PORT ?? 9333);

let sequence = 0;
const pending = new Map();

await mkdir(outDir, { recursive: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--window-size=1440,1300',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${path.resolve('.tmp/chrome-doc-screens')}`,
  'about:blank',
], { stdio: 'ignore' });

try {
  const page = await createPage();
  await send(page, 'Page.enable');
  await send(page, 'Runtime.enable');
  await send(page, 'Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1300,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await navigate(page, appUrl);
  await waitForText(page, 'Run Agentic Review', 30000);
  await screenshot(page, '01-dashboard-ready.png');

  await evaluate(page, clickButtonScript('Run Agentic Review'));
  await waitForText(page, 'BLOCKED', 120000);
  await screenshot(page, '02-dashboard-review-complete.png');

  await evaluate(page, clickButtonScript('Quality Checks'));
  await waitForText(page, 'Dependency/Security Audit', 30000);
  await screenshot(page, '03-quality-checks.png');

  await evaluate(page, clickButtonScript('Reviews'));
  await waitForText(page, 'Findings', 30000);
  await screenshot(page, '04-findings-and-human-review.png');

  await evaluate(page, clickButtonScript('Agent Activity'));
  await waitForText(page, 'Review Completed', 30000);
  await screenshot(page, '05-agent-activity-trace.png');
} finally {
  chrome.kill();
}

async function createPage() {
  await waitForChrome();
  const tab = await fetchJson(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  return socket;
}

async function waitForChrome() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      await fetchJson(`http://127.0.0.1:${debugPort}/json/version`);
      return;
    } catch {
      await delay(250);
    }
  }
  throw new Error('Chrome debugging endpoint did not start');
}

function send(socket, method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function navigate(socket, url) {
  await send(socket, 'Page.navigate', { url });
  await delay(1200);
}

async function waitForText(socket, text, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  while (Date.now() < deadline) {
    const result = await evaluate(socket, 'document.body.innerText');
    lastText = String(result);
    if (String(result).toLowerCase().includes(text.toLowerCase())) return;
    await delay(500);
  }
  await screenshot(socket, `debug-timeout-${Date.now()}.png`);
  throw new Error(`Timed out waiting for text: ${text}. Last body text: ${lastText.slice(0, 500)}`);
}

async function evaluate(socket, expression) {
  const result = await send(socket, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result?.value;
}

async function screenshot(socket, filename) {
  await evaluate(socket, 'window.scrollTo(0, 0)');
  await delay(350);
  const result = await send(socket, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
  });
  await writeFile(path.join(outDir, filename), Buffer.from(result.data, 'base64'));
}

function clickButtonScript(label) {
  return `
    (() => {
      const expected = ${JSON.stringify(label.toLowerCase())};
      const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent.toLowerCase().includes(expected));
      if (!button) throw new Error('Button not found: ${label}');
      button.click();
      return true;
    })()
  `;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
