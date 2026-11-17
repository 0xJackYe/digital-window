import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { inspectGeneratedAssets, imageDimensions } = require('../scripts/verify-generated-assets.cjs');
const scenes = ['denver', 'manhattan', 'medieval', 'kyoto', 'fuji', 'lake', 'coast', 'forest'];
const phases = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night'];

// Valid monochrome PNGs are test-only data in an OS temporary directory.
// They are never copied into the product landscape directory.
function png(width, height) {
  const crc = bytes => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((width + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}

test('native image inspection reports returned PNG/JPEG dimensions and rejects a truncated PNG', () => {
  const native = png(1672, 941);
  assert.deepEqual(imageDimensions(native), { format: 'png', width: 1672, height: 941 });
  assert.throws(() => imageDimensions(native.subarray(0, native.length - 3)), /Incomplete|Truncated/);
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 3, 0x84, 6, 0x40, 1, 1, 0x11, 0, 0xff, 0xd9]);
  assert.deepEqual(imageDimensions(jpegHeader), { format: 'jpeg', width: 1600, height: 900 });
  assert.throws(() => imageDimensions(Buffer.from('not an image')), /Expected PNG or JPEG/);
});

test('the 48-asset packaging gate accepts real native sizes and rejects missing, low-size or mismatched outputs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'digital-window-assets-'));
  const asset = (scene, phase) => path.join(rootDir, 'assets', 'landscapes', 'generated', scene, `${phase}.png`);
  try {
    assert.equal(inspectGeneratedAssets({ rootDir }).missing.length, 48);
    const native = png(1672, 941);
    for (const scene of scenes) {
      fs.mkdirSync(path.dirname(asset(scene, 'noon')), { recursive: true });
      for (const phase of phases) fs.writeFileSync(asset(scene, phase), native);
    }
    const complete = inspectGeneratedAssets({ rootDir });
    assert.equal(complete.passed, true);
    assert.equal(complete.expected, 48);
    assert.equal(complete.ready, 48);
    assert.ok(complete.files.every(file => file.width === 1672 && file.height === 941));
    fs.writeFileSync(asset('manhattan', 'night'), png(1671, 941));
    assert.equal(inspectGeneratedAssets({ rootDir }).passed, true);

    fs.writeFileSync(asset('denver', 'night'), png(1600, 900));
    fs.writeFileSync(asset('coast', 'noon'), png(1024, 576));
    fs.writeFileSync(asset('forest', 'morning'), Buffer.from('invalid image'));
    fs.unlinkSync(asset('lake', 'evening'));
    const incomplete = inspectGeneratedAssets({ rootDir });
    assert.equal(incomplete.passed, false);
    assert.equal(incomplete.expected, 48);
    assert.equal(incomplete.ready, 44);
    assert.equal(incomplete.invalid.length, 3);
    assert.equal(incomplete.missing.length, 1);
    assert.ok(incomplete.invalid.some(file => /share native dimensions/.test(file.reason)));
    assert.ok(incomplete.invalid.some(file => /at least 1600x900/.test(file.reason)));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
