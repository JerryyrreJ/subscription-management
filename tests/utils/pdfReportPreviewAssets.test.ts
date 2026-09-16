import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const A4_PORTRAIT = 297 / 210;
const SNAPSHOT = 'docs-site/images/product/pdf-report-snapshot.png';
const ANNUAL = 'docs-site/images/product/pdf-report-annual.png';

const pngSize = (path: string): { width: number; height: number } => {
 const buffer = readFileSync(path);
 assert.equal(buffer.subarray(1, 4).toString(), 'PNG', `${path} is not a PNG`);
 return {
  width: buffer.readUInt32BE(16),
  height: buffer.readUInt32BE(20),
 };
};

test('README snapshot and annual PDF previews share an A4 portrait box so equal-width heights match', () => {
 const snapshot = pngSize(SNAPSHOT);
 const annual = pngSize(ANNUAL);

 // GitHub README renders both at width="49%". Displayed height follows intrinsic aspect.
 // The pre-fix snapshot was 1588×2616 (ratio ≈ 1.647), which is why it stood taller.
 assert.equal(snapshot.width, annual.width);
 assert.equal(snapshot.height, annual.height);
 assert.ok(
  Math.abs(snapshot.height / snapshot.width - A4_PORTRAIT) < 0.002,
  `preview aspect ${snapshot.height / snapshot.width} is not A4 portrait ${A4_PORTRAIT}`
 );
});
