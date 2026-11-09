import assert from 'node:assert/strict';
import test from 'node:test';
import { hasExternalCssReference, normaliseCss } from '../src/cli/cssExternalRefs.js';
import { CoverTemplateError, renderCoverTemplate } from '../src/cli/coverTemplate.js';
import { readFrontMatter } from '../src/cli/documentExport.js';

const URL_ = 'http://example.invalid/x.png';

test('plain external references are refused (unchanged behaviour)', () => {
  for (const css of [
    '@import "http://example.invalid/x.css";',
    `body{background:url(${URL_})}`,
    `body{background:url("${URL_}")}`,
    "body{background:url( 'https://example.invalid/x.png' )}",
    'body{background:url(//example.invalid/x.png)}',
    `@font-face{font-family:a;src:url(${URL_}) format("woff")}`,
    `BODY{BACKGROUND:URL(${URL_})}`,
  ]) assert.equal(hasExternalCssReference(css), true, css);
});

test('escapes, split comments and image-set do not hide an external reference (#792)', () => {
  for (const css of [
    '@\\69mport "http://example.invalid/x.css";',
    '@\\000069mport "http://example.invalid/x.css";',
    `body{background:\\75rl(${URL_})}`,
    `body{background:\\75 rl(${URL_})}`,
    'body{background:url(\\68ttp://example.invalid/x.png)}',
    'body{background:url(\\68 ttp://example.invalid/x.png)}',
    'body{background:url("\\68ttp://example.invalid/x.png")}',
    `body{background:u/**/rl(${URL_})}`,
    `@im/* x */port "${URL_}";`,
    `body{background:image-set("${URL_}" 1x)}`,
    `body{background:-webkit-image-set("a.png" 1x, "${URL_}" 2x)}`,
    'body{background:image-set("//example.invalid/x.png" 1x)}',
    `body{background:image("${URL_}")}`,
    `body{background:url(${URL_.slice(0, 12)}/*c*/${URL_.slice(12)})}`,
  ]) assert.equal(hasExternalCssReference(css), true, css);
});

test('local, inline and ordinary CSS is allowed', () => {
  for (const css of [
    'body{color:#123;font-family:"Noto Sans JP"}',
    'body{background:url(data:image/png;base64,AAAA)}',
    'body{background:url("data:image/svg+xml;utf8,<svg/>")}',
    '@font-face{font-family:a;src:url(data:font/woff2;base64,AAAA)}',
    'body{background:url(images/logo.png)}',
    'body{background:image-set("images/a.png" 1x, "images/b.png" 2x)}',
    'body{background:image-set("data:image/png;base64,AAAA" 1x)}',
    '/* @import "http://example.invalid/x.css"; */ body{color:red}',
    'body::before{content:"see http://example.invalid"}',
  ]) assert.equal(hasExternalCssReference(css), false, css);
});

test('normaliseCss removes comments and decodes escapes but leaves string text alone', () => {
  assert.equal(normaliseCss('a/* c */b'), 'ab');
  assert.equal(normaliseCss('\\75rl(x)'), 'url(x)');
  assert.equal(normaliseCss('content:"/* not a comment */"'), 'content:"/* not a comment */"');
  assert.equal(normaliseCss('a{}/* unterminated'), 'a{}');
});

test('a cover template gets the same result as customer css', () => {
  const properties = readFrontMatter('---\ntitle: x\n---\n').properties;
  const refused = (template: string) => assert.throws(
    () => renderCoverTemplate(template, properties, 'x'),
    (error: unknown) => error instanceof CoverTemplateError && /external url/.test(error.message),
    template,
  );
  refused(`<style>@\\69mport "http://example.invalid/x.css";</style>`);
  refused(`<style>.a{background:\\75rl(${URL_})}</style>`);
  refused(`<div style="background:u/**/rl(${URL_})"></div>`);
  refused(`<style>.a{background:image-set("${URL_}" 1x)}</style>`);
  assert.doesNotThrow(() => renderCoverTemplate('<style>.a{background:url(data:image/png;base64,AAAA)}</style>', properties, 'x'));
});
