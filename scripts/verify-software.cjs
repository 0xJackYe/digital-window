'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const argumentsList = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argumentsList.indexOf(name);
  return index < 0 ? fallback : argumentsList[index + 1];
};
const target = option('--target', 'all');
const reportPath = path.resolve(root, option('--report', '.test-results/software-report.json'));
const executable = path.resolve(root, option('--exe', 'release/数字窗户-win32-x64/数字窗户.exe'));
const selectedSuites = option('--suites', null)?.split(',');
const includeSuite = (name) => !selectedSuites || selectedSuites.includes(name.replace(/^(?:source|packaged)-/, ''));
const results = [];
const started = Date.now();
const digest = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;

function filesWithin(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesWithin(filename) : [filename];
  });
}

function sanitize(value) {
  if (typeof value === 'string') {
    return value.replaceAll(root, '<project>').replaceAll(root.replaceAll('\\', '/'), '<project>')
      .replace(/[a-z]:[\\/]Users[\\/][^\\/\s]+/gi, '<user>');
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, ['deviceId', 'groupId'].includes(key) ? '<redacted>' : sanitize(child)]));
  return value;
}

async function command(name, binary, args, marker, timeout = 120000) {
  const commandStarted = Date.now();
  console.log(`Verifying ${name}...`);
  const result = await new Promise((resolve) => {
    let stdout = '', stderr = '', timedOut = false, spawnError;
    const child = spawn(binary, args, { cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('error', (error) => { spawnError = error.message; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const line = marker ? stdout.split(/\r?\n/).findLast((candidate) => candidate.startsWith(`${marker} `)) : null;
      let details;
      try { details = line ? JSON.parse(line.slice(marker.length + 1)) : undefined; }
      catch { details = { passed: false, error: 'Malformed structured test output' }; }
      resolve({ name, passed: code === 0 && !timedOut && !spawnError && (!marker || details?.passed === true), code, signal, timedOut, elapsedMs: Date.now() - commandStarted, ...(details ? { details } : {}), ...(spawnError ? { error: spawnError } : {}), stdout, stderr });
    });
  });
  const logDirectory = path.join(root, '.test-results');
  fs.mkdirSync(logDirectory, { recursive: true });
  fs.writeFileSync(path.join(logDirectory, `${name.replace(/[^a-z0-9-]/gi, '-')}.log`), `${result.stdout}\n${result.stderr}`);
  delete result.stdout;
  if (!result.stderr) delete result.stderr;
  results.push(result);
  console.log(`${name}: ${result.passed ? 'PASS' : 'FAIL'} (${result.elapsedMs}ms)`);
  return result;
}

async function verifyPackageFreshness() {
  try {
    if (!fs.existsSync(executable)) throw new Error('Packaged executable is missing. Run npm run package first.');
    const asarModule = await import('@electron/asar');
    const asar = asarModule.default || asarModule;
    const archive = path.join(path.dirname(executable), 'resources', 'app.asar');
    const files = ['src', 'electron', 'assets'].flatMap((folder) => filesWithin(path.join(root, folder)).map((filename) => path.relative(root, filename).replaceAll('\\', '/')));
    const mismatches = [];
    const hashes = [];
    const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const packagedManifest = JSON.parse(asar.extractFile(archive, 'package.json').toString());
    if (['name', 'version', 'type', 'main'].some((field) => sourceManifest[field] !== packagedManifest[field])) mismatches.push('package.json runtime fields');
    for (const relative of files) {
      const sourceHash = digest(fs.readFileSync(path.join(root, relative)));
      let packagedHash;
      try { packagedHash = digest(asar.extractFile(archive, path.normalize(relative))); }
      catch { packagedHash = null; }
      if (sourceHash !== packagedHash) mismatches.push(relative);
      hashes.push(`${relative}:${sourceHash}`);
    }
    const result = { name: 'packaged-source-and-assets-match', passed: mismatches.length === 0, comparedFiles: files.length, sourceTreeSha256: digest(Buffer.from(hashes.join('\n'))), mismatches };
    results.push(result);
    return result.passed;
  } catch (error) {
    results.push({ name: 'packaged-source-and-assets-match', passed: false, error: error.message });
    return false;
  }
}

async function main() {
  if (!['all', 'source', 'packaged'].includes(target)) throw new Error('--target must be all, source, or packaged');
  if (selectedSuites?.some((suite) => !['smoke', 'lighting', 'lighting-canvas', 'natural', 'natural-fallback', 'software-flows', 'native-lifecycle'].includes(suite))) throw new Error('Unknown --suites selection');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const javascriptFiles = ['src', 'electron', 'scripts', 'tests'].flatMap((folder) => filesWithin(path.join(root, folder))).filter((filename) => /\.(?:js|cjs)$/.test(filename));
  const syntaxFailures = [];
  for (const filename of javascriptFiles) {
    await new Promise((resolve) => {
      const child = spawn(process.execPath, ['--check', filename], { cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let error = '';
      child.stderr.on('data', (data) => { error += data.toString(); });
      child.on('close', (code) => { if (code !== 0) syntaxFailures.push({ file: path.relative(root, filename), error }); resolve(); });
    });
  }
  results.push({ name: 'all-javascript-syntax', passed: syntaxFailures.length === 0, files: javascriptFiles.length, failures: syntaxFailures });
  const testFiles = filesWithin(path.join(root, 'tests')).filter((filename) => filename.endsWith('.test.js'));
  await command('unit-tests', process.execPath, ['--test', ...testFiles], null);

  if (target === 'all' || target === 'source') {
    const electron = require('electron');
    for (const [name, flag, marker] of [
      ['source-smoke', '--smoke-test', 'DIGITAL_WINDOW_SMOKE'],
      ['source-lighting', '--lighting-test', 'DIGITAL_WINDOW_LIGHTING'],
      ['source-lighting-canvas', '--lighting-test', 'DIGITAL_WINDOW_LIGHTING'],
      ['source-natural', '--natural-test', 'DIGITAL_WINDOW_NATURAL'],
      ['source-natural-fallback', '--natural-test', 'DIGITAL_WINDOW_NATURAL'],
      ['source-software-flows', '--software-test', 'DIGITAL_WINDOW_SOFTWARE'],
    ]) if (includeSuite(name)) await command(name, electron, [root, flag, ...((name.endsWith('-canvas') || name.endsWith('-fallback')) ? ['--disable-webgl'] : [])], marker, name.includes('natural') ? 240000 : 120000);
  }
  if (target === 'all' || target === 'packaged') {
    if (await verifyPackageFreshness()) {
      for (const [name, flag, marker] of [
        ['packaged-smoke', '--smoke-test', 'DIGITAL_WINDOW_SMOKE'],
        ['packaged-lighting', '--lighting-test', 'DIGITAL_WINDOW_LIGHTING'],
        ['packaged-lighting-canvas', '--lighting-test', 'DIGITAL_WINDOW_LIGHTING'],
        ['packaged-natural', '--natural-test', 'DIGITAL_WINDOW_NATURAL'],
        ['packaged-natural-fallback', '--natural-test', 'DIGITAL_WINDOW_NATURAL'],
        ['packaged-software-flows', '--software-test', 'DIGITAL_WINDOW_SOFTWARE'],
      ]) if (includeSuite(name)) await command(name, executable, [flag, ...((name.endsWith('-canvas') || name.endsWith('-fallback')) ? ['--disable-webgl'] : [])], marker, name.includes('natural') ? 240000 : 120000);
      if (includeSuite('packaged-native-lifecycle')) await command('packaged-native-lifecycle', process.execPath, [path.join(__dirname, 'verify-lifecycle.cjs'), '--exe', executable], 'DIGITAL_WINDOW_LIFECYCLE_SUMMARY');
    }
  }
  const report = sanitize({ passed: results.every((result) => result.passed), generatedAt: new Date().toISOString(), version: manifest.version, target, selectedSuites: selectedSuites || 'all', platform: process.platform, architecture: process.arch, nodeVersion: process.version, elapsedMs: Date.now() - started, results });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`DIGITAL_WINDOW_SOFTWARE_REPORT ${JSON.stringify({ passed: report.passed, report: path.relative(root, reportPath), suites: results.length, elapsedMs: report.elapsedMs })}`);
  process.exitCode = report.passed ? 0 : 1;
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
