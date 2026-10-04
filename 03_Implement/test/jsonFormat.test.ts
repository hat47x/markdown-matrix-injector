import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeJsonUtf8 } from '../src/core/jsonFormat.js';

test('JSON byte decoder preserves valid UTF-8 and rejects replacement decoding', () => {
  assert.equal(
    decodeJsonUtf8(Buffer.from('{"name":"設計😀"}', 'utf8')),
    '{"name":"設計😀"}',
  );
  assert.throws(
    () => decodeJsonUtf8(
      Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]),
    ),
    /valid UTF-8/u,
  );
});
