'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..');
const exeFlag = process.argv.indexOf('--exe');
const executable = path.resolve(exeFlag >= 0 ? process.argv[exeFlag + 1] : path.join(projectRoot, 'release', '数字窗户-win32-x64', '数字窗户.exe'));
const cases = ['escape', 'alt-f4', 'menu-quit', 'native-close'];

async function runSingleInstanceCase() {
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
  const profile = randomUUID(), started = Date.now();
  const args = ['--lifecycle-test=single-instance', `--lifecycle-profile=${profile}`];
  let secondary, primaryOutput = '', secondaryOutput = '', timedOut = false;
  let primaryCode = null, secondaryCode = null;
  const launch = () => spawn(executable, args, { cwd: path.dirname(executable), env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  return new Promise((resolve) => {
    const primary = launch();
    const timer = setTimeout(() => { timedOut = true; primary.kill(); secondary?.kill(); }, 25000);
    const finish = () => {
      if (primaryCode === null || secondaryCode === null) return;
      clearTimeout(timer);
      const rejected = secondaryOutput.includes('"event":"single-instance-rejected"');
      const oneWindow = primaryOutput.includes('"event":"second-instance-received"') && primaryOutput.includes('"windowCount":1');
      resolve({ case: 'single-instance', passed: primaryCode === 0 && secondaryCode === 0 && !timedOut && rejected && oneWindow, primaryCode, secondaryCode, rejected, oneWindow, timedOut, elapsedMs: Date.now() - started });
    };
    primary.stdout.on('data', (data) => {
      const text = data.toString(); primaryOutput += text; process.stdout.write(text);
      if (!secondary && primaryOutput.includes('"event":"single-instance-waiting"')) {
        secondary = launch();
        secondary.stdout.on('data', (chunk) => { secondaryOutput += chunk.toString(); process.stdout.write(chunk); });
        secondary.on('error', () => { secondaryCode = -1; primary.kill(); });
        secondary.on('close', (code) => { secondaryCode = code ?? -1; finish(); });
      }
    });
    primary.on('error', () => { primaryCode = -1; secondaryCode = -1; finish(); });
    primary.on('close', (code) => { primaryCode = code ?? -1; if (!secondary) secondaryCode = -1; finish(); });
  });
}

async function runCase(testCase) {
  // Exercise Windows' case-insensitive file identity with the packaged menu path.
  // The user's affected app was launched using a lowercase drive letter.
  const caseExecutable = process.platform === 'win32' && testCase === 'menu-quit'
    ? executable.replace(/^[A-Z]:/, (drive) => drive.toLowerCase()) : executable;
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(caseExecutable, [`--lifecycle-test=${testCase}`], {
      cwd: path.dirname(caseExecutable), env: environment,
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let output = '', errors = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 25000);
    child.stdout.on('data', (data) => {
      const text = data.toString(); output += text; process.stdout.write(text);
    });
    child.stderr.on('data', (data) => { errors += data.toString(); });
    child.once('error', (error) => {
      clearTimeout(timer);
      resolve({ case: testCase, passed: false, error: error.message });
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      const events = output.split(/\r?\n/).filter((line) => line.startsWith('DIGITAL_WINDOW_LIFECYCLE ')).map((line) => {
        try { return JSON.parse(line.slice('DIGITAL_WINDOW_LIFECYCLE '.length)); } catch { return null; }
      }).filter(Boolean);
      const didQuit = events.some((event) => event.event === 'quit' && event.code === 0);
      const failed = events.some((event) => event.event === 'result' && event.passed === false);
      const actionObserved = testCase === 'escape'
        ? events.some((event) => event.event === 'native-escape') && events.some((event) => event.event === 'result' && event.passed === true)
        : testCase === 'alt-f4'
          ? events.some((event) => event.event === 'native-alt-f4') && events.some((event) => event.event === 'quit-requested' && event.reason === 'alt-f4')
          : testCase === 'menu-quit'
            ? events.some((event) => event.event === 'menu-quit-accepted') && events.some((event) => event.event === 'quit-requested' && event.reason === 'menu-quit')
            : events.some((event) => event.event === 'trigger' && event.action === 'native-close') && events.some((event) => event.event === 'native-window-close');
      resolve({
        case: testCase, executable: caseExecutable, passed: code === 0 && !timedOut && didQuit && actionObserved && !failed,
        code, signal, timedOut, didQuit, actionObserved, elapsedMs: Date.now() - started,
        ...(errors.trim() ? { stderr: errors.trim().slice(-4000) } : {}),
      });
    });
  });
}

async function main() {
  if (!fs.existsSync(executable)) throw new Error(`Rebuild the portable Windows application first: ${executable}`);
  const results = [];
  for (const testCase of cases) results.push(await runCase(testCase));
  results.push(await runSingleInstanceCase());
  const passed = results.every((result) => result.passed);
  console.log(`DIGITAL_WINDOW_LIFECYCLE_SUMMARY ${JSON.stringify({ passed, executable, results })}`);
  process.exitCode = passed ? 0 : 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
