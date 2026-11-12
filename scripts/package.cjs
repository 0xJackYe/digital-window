'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'release');
const appName = '数字窗户';
const expectedOutput = path.resolve(outputRoot, `${appName}-win32-x64`);

async function main() {
  const relativeOutput = path.relative(projectRoot, expectedOutput);
  if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
    throw new Error('Packaging output must remain inside this project.');
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  let packagerModule;
  let electronVersion;
  try {
    packagerModule = await import('@electron/packager');
    electronVersion = require('electron/package.json').version;
  } catch (error) {
    throw new Error(`Packaging dependencies are missing. Run npm install first.\n${error.message}`);
  }
  const packager = packagerModule.default || packagerModule.packager;
  if (typeof packager !== 'function') throw new Error('Unsupported @electron/packager API.');
  const icon = path.join(projectRoot, 'assets', 'icon.ico');
  const electronZipDir = path.join(projectRoot, 'node_modules', '.cache', 'electron');

  const options = {
    dir: projectRoot,
    out: outputRoot,
    name: appName,
    executableName: appName,
    platform: 'win32',
    arch: 'x64',
    electronVersion,
    ...(fs.existsSync(electronZipDir) ? { electronZipDir } : {}),
    appVersion: manifest.version,
    buildVersion: manifest.version,
    appCopyright: 'Copyright © 2026 Digital Window contributors',
    asar: true,
    prune: true,
    overwrite: true,
    junk: true,
    ignore: [
      /[\\/](?:release|node_modules|tests|\.git|scripts|reports|captures|logs|\.test-results)(?:[\\/]|$)/i,
      /[\\/](?:\.gitignore|package-lock\.json|npm-debug\.log|.*\.log|.*\.tmp|.*\.bak)$/i,
      /[\\/]启动数字窗户\.cmd$/,
    ],
    win32metadata: {
      CompanyName: 'Digital Window',
      FileDescription: 'Digital Window · 数字窗户',
      ProductName: appName,
      InternalName: 'DigitalWindow',
    },
    ...(fs.existsSync(icon) ? { icon } : {}),
  };

  const outputs = await packager(options);
  if (!outputs.includes(expectedOutput)) {
    throw new Error(`Unexpected packaging output: ${outputs.join(', ')}`);
  }
  const executable = path.join(expectedOutput, `${appName}.exe`);
  if (!fs.existsSync(executable)) throw new Error('Packaged executable was not created.');
  for (const filename of ['README.md', 'ASSET_CREDITS.md', 'ASSET_RESEARCH.md', 'THIRD_PARTY_NOTICES.md']) {
    const source = path.join(projectRoot, filename);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(expectedOutput, filename));
  }
  // Make photo provenance readable beside the portable EXE without duplicating
  // the full-resolution JPEGs that are already bundled inside app.asar.
  const photoSource = path.join(projectRoot, 'assets', 'landscapes', 'photos');
  const photoOutput = path.join(expectedOutput, 'assets', 'landscapes', 'photos');
  fs.mkdirSync(photoOutput, { recursive: true });
  for (const filename of fs.readdirSync(photoSource).filter((name) => /\.(?:json|md)$/i.test(name))) {
    fs.copyFileSync(path.join(photoSource, filename), path.join(photoOutput, filename));
  }
  const reportsSource = path.join(projectRoot, 'reports');
  if (fs.existsSync(reportsSource)) {
    const reportsOutput = path.join(expectedOutput, 'reports');
    fs.mkdirSync(reportsOutput, { recursive: true });
    for (const filename of fs.readdirSync(reportsSource).filter((name) => /\.(?:json|png|jpg|html)$/i.test(name))) {
      fs.copyFileSync(path.join(reportsSource, filename), path.join(reportsOutput, filename));
    }
  }
  const sourceLicense = path.join(projectRoot, 'LICENSE');
  if (fs.existsSync(sourceLicense)) fs.copyFileSync(sourceLicense, path.join(expectedOutput, 'PROJECT_LICENSE.txt'));
  fs.copyFileSync(path.join(projectRoot, 'vendor', 'THREE-LICENSE.txt'), path.join(expectedOutput, 'THREE-LICENSE.txt'));
  console.log(`Portable Windows application ready:\n${executable}\nKeep the entire ${path.basename(expectedOutput)} folder together.`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
