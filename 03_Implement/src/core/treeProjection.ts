/**
 * Projection: how a Tree is written in Markdown (issue-0199). Kept apart from
 * the Tree model so headings, Mermaid or other forms can be added later
 * without touching adapters. The first projection is a nested bullet list.
 *
 * The projection is lossy by design (it is for reading); the Tree and the
 * Candidate in `--json` are the machine-readable form.
 */
import type { Tree, TreeNode } from './tree.js';

export type TreeProjectionKind = 'nested-list';

export interface NestedListOptions {
  /** Spaces per nesting level (default 2). */
  indent?: number;
}

/**
 * One line of Markdown text: newlines folded, `<` escaped so tags in values
 * (XML text, CDATA) stay visible instead of becoming HTML, and leading
 * list/heading/quote markers escaped so a label never starts a new block.
 */
function inline(text: string): string {
  const folded = text
    .replace(/\r\n?|\n/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    // Code spans already show `<` literally; a backslash there would be shown too.
    .split(/(`+[^`]*?`+)/u)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/</gu, '\\<')))
    .join('');
  return folded
    .replace(/^(\d+)([.)])(?=\s|$)/u, '$1\\$2')
    .replace(/^([-+*>#])(?=\s|$)/u, '\\$1')
    .replace(/^(#{1,6})(?=\s)/u, '\\$1');
}

function attributesOf(node: TreeNode): string {
  if (!node.attributes || node.attributes.length === 0) return '';
  return ` (${node.attributes.map((a) => `@${a.name}="${inline(a.value)}"`).join(', ')})`;
}

/** The text after `- ` for one node, and whether its children were folded into it. */
function itemText(node: TreeNode): { text: string; foldedChildren: boolean } {
  switch (node.kind) {
    case 'object':
      return { text: node.children.length === 0 ? `${inline(node.label)}: {}` : inline(node.label), foldedChildren: false };
    case 'array':
      return { text: node.children.length === 0 ? `${inline(node.label)}: []` : inline(node.label), foldedChildren: false };
    case 'value':
      return { text: `${inline(node.label)}: ${node.valueType === 'string' ? inline(node.value ?? '') || '""' : node.value ?? ''}`, foldedChildren: false };
    case 'element': {
      const only = node.children.length === 1 ? node.children[0] : undefined;
      if (only && only.kind === 'text' && only.children.length === 0) {
        return { text: `${inline(node.label)}${attributesOf(node)}: ${inline(only.value ?? '')}`, foldedChildren: true };
      }
      return { text: `${inline(node.label)}${attributesOf(node)}`, foldedChildren: false };
    }
    case 'text':
      return { text: inline(node.value ?? ''), foldedChildren: false };
    case 'cdata':
      return { text: `(CDATA) ${inline(node.value ?? '')}`, foldedChildren: false };
    case 'comment':
      return { text: `(comment) ${inline(node.value ?? '')}`, foldedChildren: false };
    case 'processing-instruction':
      return { text: `(?${inline(node.label)}) ${inline(node.value ?? '')}`.trimEnd(), foldedChildren: false };
    case 'line':
      return { text: inline(node.label), foldedChildren: false };
  }
}

/** The tree as a Markdown nested bullet list, one node per line. */
export function projectNestedList(tree: Tree, options: NestedListOptions = {}): string {
  const unit = ' '.repeat(options.indent ?? 2);
  const lines: string[] = [];
  const stack: { node: TreeNode; depth: number }[] = [...tree.roots].reverse().map((node) => ({ node, depth: 0 }));
  while (stack.length > 0) {
    const { node, depth } = stack.pop() as { node: TreeNode; depth: number };
    const { text, foldedChildren } = itemText(node);
    lines.push(`${unit.repeat(depth)}- ${text}`.trimEnd());
    if (!foldedChildren) for (let i = node.children.length - 1; i >= 0; i -= 1) stack.push({ node: node.children[i], depth: depth + 1 });
  }
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}
