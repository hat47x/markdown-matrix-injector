/**
 * MMI Notation v1 conformance runner (spec §12).
 *
 * Executes every case in test/conformance/cases.json against the reference
 * implementation (markdownMatrixPlugin). Each case materializes its declared
 * files next to a virtual Markdown document, renders the case's markdown, and
 * asserts the declared substrings (HTML contract of spec §8.1) appear / do not
 * appear. The corpus doubles as the normative example set for other
 * implementations and as machine-readable teaching data for AI agents.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { WorkbookCache } from '../src/cache/workbookCache.js';
import { markdownMatrixPlugin } from '../src/plugin/markdownMatrixPlugin.js';
import { AUTOCOMPLETE_QUERY_PARAM_CANDIDATES } from '../src/dx/autocompleteProvider.js';

interface ConformanceCase {
  name: string;
  level: 'core' | 'L1' | 'L2' | 'L3';
  spec: string;
  files: Record<string, string>;
  markdown: string;
  expectContains: string[];
  expectNotContains?: string[];
}

const CASES_PATH = path.resolve('test/conformance/cases.json');
const PARAMS_SCHEMA_PATH = path.resolve('../04_Documentation/spec/params.schema.json');

const cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf-8')) as ConformanceCase[];

test('conformance corpus is structurally valid (self-check against case.schema.json contract)', () => {
  assert.ok(cases.length >= 15, `corpus should keep meaningful coverage, got ${cases.length} cases`);
  const seen = new Set<string>();
  for (const c of cases) {
    assert.match(c.name, /^[a-z0-9-]+$/, `case name must be kebab-case: ${c.name}`);
    assert.ok(!seen.has(c.name), `duplicate case name: ${c.name}`);
    seen.add(c.name);
    assert.ok(['core', 'L1', 'L2', 'L3'].includes(c.level), `invalid level in ${c.name}`);
    assert.ok(c.spec.length > 0, `spec clause reference required in ${c.name}`);
    assert.ok(c.expectContains.length >= 1, `expectContains must not be empty in ${c.name}`);
  }
});

test('params.schema.json covers every query parameter the implementation offers', () => {
  const schema = JSON.parse(fs.readFileSync(PARAMS_SCHEMA_PATH, 'utf-8')) as {
    properties: Record<string, unknown>;
    additionalProperties: unknown;
  };
  for (const candidate of AUTOCOMPLETE_QUERY_PARAM_CANDIDATES) {
    assert.ok(
      candidate in schema.properties,
      `params.schema.json is missing implemented parameter "${candidate}" (machine-readable contract drift)`,
    );
  }
  // Principle P5: the schema must not be usable to reject unknown keys.
  assert.equal(schema.additionalProperties, true, 'additionalProperties must stay true (P5 forward compatibility)');
});

for (const conformanceCase of cases) {
  test(`conformance: ${conformanceCase.name} [${conformanceCase.level}] (${conformanceCase.spec})`, () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `mmi-conformance-${conformanceCase.name}-`));
    const docsDir = path.join(tempDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    for (const [relativePath, content] of Object.entries(conformanceCase.files)) {
      const filePath = path.join(docsDir, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }

    const md = new MarkdownIt();
    md.use(markdownMatrixPlugin, {
      markdownFilePath: path.join(docsDir, 'spec.md'),
      cache: new WorkbookCache(),
    });

    const html = md.render(conformanceCase.markdown);

    for (const expected of conformanceCase.expectContains) {
      assert.ok(
        html.includes(expected),
        `[${conformanceCase.name}] output must contain ${JSON.stringify(expected)}\n--- rendered ---\n${html}`,
      );
    }
    for (const forbidden of conformanceCase.expectNotContains ?? []) {
      assert.ok(
        !html.includes(forbidden),
        `[${conformanceCase.name}] output must NOT contain ${JSON.stringify(forbidden)}\n--- rendered ---\n${html}`,
      );
    }
  });
}
