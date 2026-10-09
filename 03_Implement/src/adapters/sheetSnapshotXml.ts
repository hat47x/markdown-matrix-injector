/**
 * A small, bounded XML reader for the sheet snapshot renderer (issue-0198).
 *
 * OOXML parts are plain XML without DTDs, so a linear tokenizer is enough.
 * It never backtracks (every search is an `indexOf` forward from the current
 * position), rejects DOCTYPE declarations instead of expanding entities, and
 * stops with `XmlLimitError` when a part has more elements or nesting than
 * the caller allows. Truncated or mismatched markup is an `XmlSyntaxError`,
 * so a broken drawing becomes a diagnostic rather than half a picture.
 *
 * Element names are kept qualified (`xdr:sp`) and also exposed by local name
 * (`sp`), because producers differ in prefixes (`x:row`, `row`, ...).
 */

export class XmlSyntaxError extends Error {}
export class XmlLimitError extends Error {}

export interface XmlLimits {
  maxElements: number;
  maxDepth: number;
}

export const DEFAULT_XML_LIMITS: XmlLimits = { maxElements: 4_000_000, maxDepth: 256 };

export interface XmlHandlers {
  open(local: string, attrs: Record<string, string>, selfClosing: boolean): void;
  close?(local: string): void;
  text?(value: string): void;
}

const localOf = (name: string): string => {
  const colon = name.indexOf(':');
  return colon < 0 ? name : name.slice(colon + 1);
};

export function decodeXmlText(value: string): string {
  if (value.indexOf('&') < 0) return value;
  return value.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|lt|gt|amp|quot|apos);/gu, (whole, body: string) => {
    switch (body) {
      case 'lt': return '<';
      case 'gt': return '>';
      case 'amp': return '&';
      case 'quot': return '"';
      case 'apos': return "'";
      default: {
        const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
        return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
      }
    }
  });
}

const ATTRIBUTE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    const key = match[1];
    const value = decodeXmlText(match[2] ?? match[3] ?? '');
    attrs[key] = value;
    // Unprefixed alias for namespaced attributes (r:embed -> embed), unless taken.
    const local = localOf(key);
    if (local !== key && !(local in attrs) && !key.startsWith('xmlns')) attrs[`:${local}`] = value;
  }
  return attrs;
}

/** Streams a document through `handlers`. Throws on malformed markup or exceeded limits. */
export function scanXml(xml: string, handlers: XmlHandlers, limits: XmlLimits = DEFAULT_XML_LIMITS): void {
  const stack: string[] = [];
  let elements = 0;
  let i = xml.charCodeAt(0) === 0xfeff ? 1 : 0;
  const length = xml.length;
  while (i < length) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      if (handlers.text && stack.length > 0) handlers.text(decodeXmlText(xml.slice(i)));
      break;
    }
    if (lt > i && handlers.text && stack.length > 0) handlers.text(decodeXmlText(xml.slice(i, lt)));
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end < 0) throw new XmlSyntaxError('unterminated processing instruction');
      i = end + 2;
      continue;
    }
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end < 0) throw new XmlSyntaxError('unterminated comment');
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end < 0) throw new XmlSyntaxError('unterminated CDATA section');
      if (handlers.text && stack.length > 0) handlers.text(xml.slice(lt + 9, end));
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<!', lt)) throw new XmlSyntaxError('DOCTYPE and other declarations are not accepted');
    if (xml[lt + 1] === '/') {
      const end = xml.indexOf('>', lt + 2);
      if (end < 0) throw new XmlSyntaxError('unterminated end tag');
      const name = xml.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (open !== name) throw new XmlSyntaxError(`end tag </${name}> does not match <${open ?? ''}>`);
      handlers.close?.(localOf(name));
      i = end + 1;
      continue;
    }
    // Start tag: find the closing '>' outside attribute quotes.
    let end = -1;
    for (let j = lt + 1; j < length; j += 1) {
      const code = xml.charCodeAt(j);
      if (code === 0x3e /* > */) {
        end = j;
        break;
      }
      if (code === 0x22 /* " */ || code === 0x27 /* ' */) {
        const close = xml.indexOf(xml[j], j + 1);
        if (close < 0) break;
        j = close;
      } else if (code === 0x3c /* < */) {
        break;
      }
    }
    if (end < 0) throw new XmlSyntaxError('unterminated start tag');
    const selfClosing = xml[end - 1] === '/';
    const inner = xml.slice(lt + 1, selfClosing ? end - 1 : end);
    const nameEnd = inner.search(/[\s]/u);
    const name = nameEnd < 0 ? inner : inner.slice(0, nameEnd);
    if (!name) throw new XmlSyntaxError('empty element name');
    elements += 1;
    if (elements > limits.maxElements) throw new XmlLimitError(`more than ${limits.maxElements} elements`);
    const attrs = nameEnd < 0 ? {} : parseAttributes(inner.slice(nameEnd));
    if (!selfClosing) {
      stack.push(name);
      if (stack.length > limits.maxDepth) throw new XmlLimitError(`nesting deeper than ${limits.maxDepth}`);
    }
    handlers.open(localOf(name), attrs, selfClosing);
    if (selfClosing) handlers.close?.(localOf(name));
    i = end + 1;
  }
  if (stack.length > 0) throw new XmlSyntaxError(`document ends inside <${stack[stack.length - 1]}>`);
  if (elements === 0) throw new XmlSyntaxError('no root element');
}

export interface XmlNode {
  /** Local name without prefix. */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Concatenated direct text content. */
  text: string;
}

/** Builds a tree (for small parts: styles, theme, drawings). */
export function parseXml(xml: string, limits: XmlLimits = DEFAULT_XML_LIMITS): XmlNode {
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  scanXml(xml, {
    open(name, attrs) {
      const node: XmlNode = { name, attrs, children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    },
    close() {
      stack.pop();
    },
    text(value) {
      stack[stack.length - 1].text += value;
    },
  }, limits);
  const element = root.children[0];
  if (!element) throw new XmlSyntaxError('no root element');
  return element;
}

/** Attribute by qualified or local name (`r:embed` or `embed`). */
export function attr(node: XmlNode | undefined, name: string): string | undefined {
  if (!node) return undefined;
  return node.attrs[name] ?? node.attrs[`:${name}`];
}

export function child(node: XmlNode | undefined, ...path: string[]): XmlNode | undefined {
  let current = node;
  for (const name of path) {
    current = current?.children.find((item) => item.name === name);
    if (!current) return undefined;
  }
  return current;
}

export function childrenNamed(node: XmlNode | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((item) => item.name === name) : [];
}

/** All descendants named `name`, in document order. */
export function descendants(node: XmlNode | undefined, name: string, out: XmlNode[] = []): XmlNode[] {
  if (!node) return out;
  for (const item of node.children) {
    if (item.name === name) out.push(item);
    descendants(item, name, out);
  }
  return out;
}
