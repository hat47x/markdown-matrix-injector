/**
 * Tree / Hierarchy -- a format-independent, pure data model (issue-0199).
 *
 * A Tree is what a Source Adapter (JSON, XML) or a Structuralizer (flat text)
 * found; how it is written in Markdown is a separate Projection
 * (`treeProjection.ts`). Nothing here knows about Markdown, files or
 * Candidates: nodes carry a label, an optional body/value, ordered
 * attributes, ordered children and where they came from in the source.
 *
 * Order is part of the data. JSON object keys, XML attributes and text lines
 * keep source order; nothing here sorts.
 */

/** What a node stands for in its source. The model is shared; the kinds say which adapter made it. */
export type TreeNodeKind =
  /** JSON */
  | 'object'
  | 'array'
  | 'value'
  /** XML */
  | 'element'
  | 'text'
  | 'cdata'
  | 'comment'
  | 'processing-instruction'
  /** Flat text: one line that became a node. */
  | 'line';

/** JSON scalar type, so a projection never has to guess whether `true` was a string. */
export type TreeValueType = 'string' | 'number' | 'boolean' | 'null';

/** Where a node is in the source. All positions are 1-based. */
export interface TreeNodeLocator {
  line: number;
  column?: number;
  /** Structural path: a JSON Pointer (`/a/0`) or an XML element path (`/root[1]/item[2]`). */
  path?: string;
}

export interface TreeAttribute {
  name: string;
  value: string;
}

export interface TreeNode {
  kind: TreeNodeKind;
  /** Key, index, element name, or line text (without the indentation). */
  label: string;
  /** Scalar value, text/comment/CDATA body. Absent for containers and plain lines. */
  value?: string;
  valueType?: TreeValueType;
  /** In source order. */
  attributes?: readonly TreeAttribute[];
  /** In source order. */
  children: readonly TreeNode[];
  locator: TreeNodeLocator;
}

/** A forest: flat text can have many top-level items; XML keeps prolog comments beside the root element. */
export interface Tree {
  roots: readonly TreeNode[];
}

export interface TreeLimits {
  /** Deepest nesting accepted (roots are depth 1). */
  maxDepth: number;
  /** Most nodes accepted. */
  maxNodes: number;
}

export const DEFAULT_TREE_LIMITS: TreeLimits = { maxDepth: 64, maxNodes: 100_000 };

export function countNodes(tree: Tree): number {
  let count = 0;
  const stack: TreeNode[] = [...tree.roots];
  while (stack.length > 0) {
    const node = stack.pop() as TreeNode;
    count += 1;
    stack.push(...node.children);
  }
  return count;
}

export function treeDepth(tree: Tree): number {
  let depth = 0;
  const stack: { node: TreeNode; depth: number }[] = tree.roots.map((node) => ({ node, depth: 1 }));
  while (stack.length > 0) {
    const item = stack.pop() as { node: TreeNode; depth: number };
    depth = Math.max(depth, item.depth);
    for (const child of item.node.children) stack.push({ node: child, depth: item.depth + 1 });
  }
  return depth;
}

/**
 * Canonical text of the tree's content and shape, locators excluded: two
 * trees with the same nodes in the same nesting give the same string even if
 * they moved in the source. Used for fingerprints and to tell alternative
 * structures apart.
 */
export function canonicalTree(tree: Tree): string {
  const out: string[] = [];
  const walk = (node: TreeNode, depth: number): void => {
    const attrs = (node.attributes ?? []).map((a) => `${a.name}\u001d${a.value}`).join('\u001c');
    out.push([String(depth), node.kind, node.label, node.value ?? '', node.valueType ?? '', attrs].join('\u001f'));
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const root of tree.roots) walk(root, 0);
  return out.join('\u001e');
}

/** Parent/child pairs by locator line, for comparing structures in tests and evidence. */
export function treeEdges(tree: Tree): [string, string][] {
  const edges: [string, string][] = [];
  const walk = (node: TreeNode, parent: string): void => {
    edges.push([parent, node.label]);
    for (const child of node.children) walk(child, node.label);
  };
  for (const root of tree.roots) walk(root, '');
  return edges;
}

// --- Extension point: a parent-id column in a table (Excel / CSV) -----------------------

export interface ParentColumnInput {
  /** Rows as display strings, header row excluded. */
  rows: readonly (readonly string[])[];
  /** 0-based column holding each row's id. */
  idColumn: number;
  /** 0-based column holding the parent's id; empty means a root. */
  parentColumn: number;
  /** 0-based column used as the node label (default: idColumn). */
  labelColumn?: number;
  /** Physical line/row number of `rows[0]` in the source (1-based; default 1). */
  firstRowNumber?: number;
}

export type ParentColumnProblemCode = 'duplicate-id' | 'missing-parent' | 'cycle' | 'empty-id';

export interface ParentColumnProblem {
  code: ParentColumnProblemCode;
  /** 1-based source row. */
  row: number;
  id: string;
}

export interface ParentColumnResult {
  /** Absent when any problem makes the structure undecidable. */
  tree?: Tree;
  problems: ParentColumnProblem[];
}

/**
 * Builds a tree from "id, parent id" rows -- the extension point for Excel /
 * CSV parent columns. The relation is stated by the data (observed), so any
 * contradiction (duplicate id, unknown parent, cycle) yields no tree: the
 * caller reports the problems rather than guessing which row was meant.
 * Not wired to a CLI yet.
 */
export function treeFromParentColumn(input: ParentColumnInput): ParentColumnResult {
  const first = input.firstRowNumber ?? 1;
  const labelColumn = input.labelColumn ?? input.idColumn;
  const problems: ParentColumnProblem[] = [];
  const rowOf = new Map<string, number>();
  input.rows.forEach((row, index) => {
    const id = (row[input.idColumn] ?? '').trim();
    if (!id) problems.push({ code: 'empty-id', row: first + index, id });
    else if (rowOf.has(id)) problems.push({ code: 'duplicate-id', row: first + index, id });
    else rowOf.set(id, index);
  });
  const parentOf = (index: number): string => (input.rows[index][input.parentColumn] ?? '').trim();
  for (const [id, index] of rowOf) {
    const parent = parentOf(index);
    if (parent && !rowOf.has(parent)) problems.push({ code: 'missing-parent', row: first + index, id });
  }
  for (const [id, index] of rowOf) {
    const seen = new Set<string>([id]);
    let cursor = parentOf(index);
    while (cursor && rowOf.has(cursor)) {
      if (seen.has(cursor)) {
        problems.push({ code: 'cycle', row: first + index, id });
        break;
      }
      seen.add(cursor);
      cursor = parentOf(rowOf.get(cursor) as number);
    }
  }
  if (problems.length > 0) return { problems: problems.sort((a, b) => a.row - b.row || a.code.localeCompare(b.code)) };

  const children = new Map<string, number[]>();
  const roots: number[] = [];
  for (const [, index] of rowOf) {
    const parent = parentOf(index);
    if (!parent) roots.push(index);
    else children.set(parent, [...(children.get(parent) ?? []), index]);
  }
  const build = (index: number): TreeNode => {
    const row = input.rows[index];
    const id = (row[input.idColumn] ?? '').trim();
    return {
      kind: 'line',
      label: row[labelColumn] ?? id,
      children: (children.get(id) ?? []).map(build),
      locator: { line: first + index },
    };
  };
  return { tree: { roots: roots.map(build) }, problems };
}
