import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalXmlSubtree,
  readXmlTree,
  resolveXmlElement,
} from '../src/adapters/xmlTreeAdapter.js';
import { fingerprintOf } from '../src/core/candidate.js';

const sourceDigest = fingerprintOf('source-bytes-v1', 'fixture').digest;

test('generic XML becomes observed deterministic Tree Candidates with stable sibling paths', () => {
  const document = readXmlTree(
    `<?xml version="1.0" encoding="UTF-8"?>
<catalog xmlns:svc="urn:svc" version="1">
  <!-- ignored comment -->
  <svc:item id="a">Hello &amp; <![CDATA[<raw>]]></svc:item>
  <svc:item id="b"><name>Second</name><name>Alias</name></svc:item>
</catalog>`,
    './catalog.xml',
    sourceDigest,
  );

  assert.deepEqual(
    document.nodes.map((node) => node.path),
    [
      '/catalog[1]',
      '/catalog[1]/svc:item[1]',
      '/catalog[1]/svc:item[2]',
      '/catalog[1]/svc:item[2]/name[1]',
      '/catalog[1]/svc:item[2]/name[2]',
    ],
  );

  const root = document.nodes[0];
  assert.equal(root.name, 'catalog');
  assert.deepEqual(root.attributeValues, [
    '@version="1"',
    '@xmlns:svc="urn:svc"',
  ]);
  assert.deepEqual(root.childPaths, [
    '/catalog[1]/svc:item[1]',
    '/catalog[1]/svc:item[2]',
  ]);

  const first = document.nodes[1];
  assert.deepEqual(first.attributeValues, ['@id="a"']);
  assert.deepEqual(first.textSegments, ['Hello & ', '<raw>']);
  assert.equal(first.candidate.kind, 'tree');
  assert.equal(first.candidate.status, 'observed');
  assert.equal(first.candidate.execution, 'deterministic');
  assert.equal(first.candidate.method, 'M0');
  assert.equal(first.candidate.locator.structuralPath, first.path);
  assert.equal(first.candidate.provenance.algorithm, 'mmi.xml-tree-adapter');
  assert.equal(
    first.candidate.claims.every((claim) =>
      claim.status === 'observed'
      && claim.execution === 'deterministic'
      && claim.method === 'M0'),
    true,
  );

  assert.equal(
    resolveXmlElement(document, '/catalog[1]/svc:item[2]/name[2]')?.name,
    'name',
  );
  assert.equal(resolveXmlElement(document, '/catalog[1]/missing[1]'), undefined);
});

test('XML subtree fingerprint is insensitive to attribute order but preserves content order', () => {
  const first = readXmlTree(
    '<root b="2" a="1"><x>one</x><x>two</x></root>',
    './one.xml',
    sourceDigest,
  );
  const reorderedAttributes = readXmlTree(
    '<root a="1" b="2"><x>one</x><x>two</x></root>',
    './two.xml',
    sourceDigest,
  );
  const reorderedChildren = readXmlTree(
    '<root a="1" b="2"><x>two</x><x>one</x></root>',
    './three.xml',
    sourceDigest,
  );

  assert.equal(
    first.nodes[0].candidate.fingerprint.digest,
    reorderedAttributes.nodes[0].candidate.fingerprint.digest,
  );
  assert.notEqual(
    first.nodes[0].candidate.fingerprint.digest,
    reorderedChildren.nodes[0].candidate.fingerprint.digest,
  );
  assert.equal(
    canonicalXmlSubtree(first.root),
    canonicalXmlSubtree(reorderedAttributes.root),
  );
});

test('numeric and predefined XML entities are decoded without expanding custom entities', () => {
  const document = readXmlTree(
    '<root><text>&lt;&amp;&gt;&#65;&#x42;</text></root>',
    './entities.xml',
    sourceDigest,
  );
  assert.deepEqual(document.nodes[1].textSegments, ['<&>AB']);

  assert.throws(
    () => readXmlTree(
      '<root>&custom;</root>',
      './bad.xml',
      sourceDigest,
    ),
    /unsupported XML entity/u,
  );
});

test('generic XML parser rejects DTD, malformed structure and non-UTF-8 declarations', () => {
  assert.throws(
    () => readXmlTree(
      '<!DOCTYPE root [<!ENTITY x "value">]><root>&x;</root>',
      './doctype.xml',
      sourceDigest,
    ),
    /DOCTYPE is not supported/u,
  );

  assert.throws(
    () => readXmlTree(
      '<root><child></root>',
      './mismatch.xml',
      sourceDigest,
    ),
    /does not match/u,
  );

  assert.throws(
    () => readXmlTree(
      '<?xml version="1.0" encoding="Shift_JIS"?><root/>',
      './sjis.xml',
      sourceDigest,
    ),
    /currently requires UTF-8/u,
  );

  assert.throws(
    () => readXmlTree(
      '<root a="1" a="2"/>',
      './duplicate.xml',
      sourceDigest,
    ),
    /duplicate attribute/u,
  );
});
