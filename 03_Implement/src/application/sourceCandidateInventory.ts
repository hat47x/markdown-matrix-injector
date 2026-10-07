import fs from 'node:fs';

import {
  DEFAULT_FLAT_TEXT_TREE_METHODS,
  decodeFlatTextUtf8,
  readFlatTextTree,
  type FlatTextTreeMethod,
} from '../adapters/flatTextTreeStructuralizer.js';
import { readJsonTree } from '../adapters/jsonTreeAdapter.js';
import { readXmlTree } from '../adapters/xmlTreeAdapter.js';
import { readYamlTree } from '../adapters/yamlTreeAdapter.js';
import type { Candidate } from '../core/candidate.js';
import { decodeJsonUtf8 } from '../core/jsonFormat.js';
import { createSourceIdentityFromBytes } from '../core/sourceIdentity.js';
import {
  decodeGenericXmlUtf8,
  isXmlSpreadsheet2003Bytes,
} from '../core/xmlFormat.js';
import { decodeYamlUtf8 } from '../core/yamlFormat.js';

export type StandaloneTreeFormat = 'json' | 'yaml' | 'xml' | 'text';

export interface StandaloneTreeNode {
  candidate: Candidate;
  pointer: string;
  format: StandaloneTreeFormat;
  nodeType: 'object' | 'array' | 'element' | 'text-node';
  childPointers: readonly string[];
  leafValues: readonly string[];
  method?: FlatTextTreeMethod;
  status?: 'inferred' | 'abstained';
}

export interface StandaloneTreeHypothesis {
  method: FlatTextTreeMethod;
  status: 'inferred' | 'abstained';
  reasonCode: string;
  nodeCount: number;
}

export interface StandaloneTreeCandidateInventory {
  candidates: readonly Candidate[];
  nodes: readonly StandaloneTreeNode[];
  hypotheses?: readonly StandaloneTreeHypothesis[];
  ambiguous?: boolean;
}

/**
 * Enumerate Candidate identity/provenance for standalone structured sources.
 *
 * Host policy belongs outside this function. In particular, CLI inspect may
 * show abstentions while the VS Code review host may omit non-actionable
 * abstained items.
 *
 * XML Spreadsheet 2003 deliberately returns undefined so callers continue
 * through the workbook/table path.
 */
export function collectStandaloneTreeCandidates(
  sourcePath: string,
  sourceLabel: string,
  flatTextMethods:
    readonly FlatTextTreeMethod[] = DEFAULT_FLAT_TEXT_TREE_METHODS,
): StandaloneTreeCandidateInventory | undefined {
  if (/\.json$/iu.test(sourcePath)) {
    const sourceBytes = fs.readFileSync(sourcePath);
    const sourceDigest =
      createSourceIdentityFromBytes(sourceBytes).digest;
    const tree = readJsonTree(
      decodeJsonUtf8(sourceBytes),
      sourceLabel,
      sourceDigest,
    );
    return {
      candidates: tree.candidates,
      nodes: tree.nodes.map((node) => ({
        candidate: node.candidate,
        pointer: node.pointer,
        format: 'json' as const,
        nodeType: node.nodeType,
        childPointers: node.childPointers,
        leafValues: node.leafValues,
      })),
    };
  }

  if (/\.ya?ml$/iu.test(sourcePath)) {
    const sourceBytes = fs.readFileSync(sourcePath);
    const sourceDigest =
      createSourceIdentityFromBytes(sourceBytes).digest;
    const tree = readYamlTree(
      decodeYamlUtf8(sourceBytes),
      sourceLabel,
      sourceDigest,
    );
    return {
      candidates: tree.candidates,
      nodes: tree.nodes.map((node) => ({
        candidate: node.candidate,
        pointer: node.pointer,
        format: 'yaml' as const,
        nodeType: node.nodeType,
        childPointers: node.childPointers,
        leafValues: node.leafValues,
      })),
    };
  }

  if (/\.xml$/iu.test(sourcePath)) {
    const sourceBytes = fs.readFileSync(sourcePath);
    if (isXmlSpreadsheet2003Bytes(sourceBytes)) return undefined;

    const sourceDigest =
      createSourceIdentityFromBytes(sourceBytes).digest;
    const tree = readXmlTree(
      decodeGenericXmlUtf8(sourceBytes),
      sourceLabel,
      sourceDigest,
    );
    return {
      candidates: tree.candidates,
      nodes: tree.nodes.map((node) => ({
        candidate: node.candidate,
        pointer: node.path,
        format: 'xml' as const,
        nodeType: 'element' as const,
        childPointers: node.childPaths,
        leafValues: [
          ...node.attributeValues,
          ...node.textValues.map(
            (value) => `#text=${JSON.stringify(value)}`,
          ),
        ],
      })),
    };
  }

  if (/\.(txt|text|log)$/iu.test(sourcePath)) {
    const sourceBytes = fs.readFileSync(sourcePath);
    const sourceDigest =
      createSourceIdentityFromBytes(sourceBytes).digest;
    const tree = readFlatTextTree(
      decodeFlatTextUtf8(sourceBytes),
      sourceLabel,
      sourceDigest,
      { methods: flatTextMethods },
    );
    return {
      candidates: tree.candidates,
      nodes: tree.hypotheses.flatMap((hypothesis) =>
        hypothesis.nodes.map((node) => ({
          candidate: node.candidate,
          pointer: node.structuralPath,
          format: 'text' as const,
          nodeType: 'text-node' as const,
          childPointers: node.childLines.map(
            (line) => `text:${hypothesis.method}:line:${line}`,
          ),
          leafValues: [node.label],
          method: hypothesis.method,
          status: hypothesis.status,
        }))),
      hypotheses: tree.hypotheses.map((hypothesis) => ({
        method: hypothesis.method,
        status: hypothesis.status,
        reasonCode: hypothesis.reasonCode,
        nodeCount: hypothesis.nodes.length,
      })),
      ambiguous: tree.ambiguous,
    };
  }

  return undefined;
}
