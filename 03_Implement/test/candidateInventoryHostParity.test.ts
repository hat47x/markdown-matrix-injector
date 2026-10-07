import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCandidateReviewInventory,
} from '../src/application/candidateReviewInventory.js';
import type { Candidate } from '../src/core/candidate.js';
import { inspectSource } from '../src/cli/mmi.js';
import {
  screenDesignWorkbook,
} from './helpers/buildXlsxWithImages.js';

function imageCandidates(items: readonly Candidate[]): Candidate[] {
  return items.filter((candidate) => candidate.kind === 'image');
}

test('CLI inspect and VS Code review inventory produce identical image Candidates', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-inventory-parity-'),
  );
  const source = path.join(root, 'design.xlsx');
  const document = path.join(root, 'spec.md');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);
  fs.writeFileSync(document, '# Spec\n');

  const cli = inspectSource(source, 0, document);
  const review = buildCandidateReviewInventory(
    source,
    './design.xlsx',
  );

  const cliImages = imageCandidates(cli.candidates);
  const reviewImages = review.items
    .filter((item) => item.kind === 'image')
    .map((item) => item.candidate);

  assert.deepEqual(reviewImages, cliImages);

  const login = reviewImages.find(
    (candidate) =>
      candidate.locator.sheet === '画面一覧'
      && candidate.locator.range === 'D1:F4',
  );
  assert.ok(login);
  assert.equal(
    login.claims.some(
      (claim) =>
        claim.aspect === 'nearby-table'
        && claim.value === 'A1:B3'
        && claim.status === 'inferred'
        && claim.method === 'M1',
    ),
    true,
  );
});
