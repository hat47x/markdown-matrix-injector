#!/usr/bin/env node
/**
 * `mmi` -- the MMI engine without VS Code, for AI agents, CI and scripts.
 * Every command is read-only: it never writes to a source workbook, and only
 * writes a file when `-o` is given.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import XLSX from 'xlsx';
import { WorkbookCache } from '../cache/workbookCache.js';
import { checkDetachedDocument } from '../application/detachCheck.js';
import { checkExtractedProvenanceFreshness } from '../application/detachFreshness.js';
import { materializeDocument } from '../application/materialize.js';
import { imageCandidates, readExcelImages, relationToTables, type ImageDiagnostic, type TableRect } from '../adapters/excelImageAdapter.js';
import { tableCandidates } from '../adapters/tableRegionAdapter.js';
import type { Candidate, ProviderScore } from '../core/candidate.js';
import { candidateLedgerView, type CandidateLedgerFilter } from '../core/candidateLedgerView.js';
import {
  readCandidateSimilarityEvidence,
  type CandidateSimilarityEvidenceEntry,
} from '../core/candidateSimilarityEvidence.js';
import {
  DEFAULT_LEDGER_FILE,
  placeOf,
  readLedger,
  type LedgerState,
  type LineageCandidate,
} from '../core/importLedger.js';
import { isPathWithinBoundary } from '../core/pathResolver.js';
import { readSourceFileIdentity } from '../core/sourceIdentity.js';
import { sliceRegion } from '../core/tableGeometry.js';
import { loadWorkbook, type WorkbookData } from '../core/workbookLoader.js';
import {
  createAiHandoffPackage,
  parseAiHandoffPackage,
  renderAiHandoffPrompt,
} from '../dx/aiHandoff.js';
import { validateAiHandoffCandidateSelection } from '../dx/aiHandoffCandidateSelectionValidation.js';
import { validateAiHandoffNotationProposal } from '../dx/aiHandoffProposalValidation.js';
import { validateAiHandoffTransformationProposal } from '../dx/aiHandoffTransformationValidation.js';
import { createDiagnosticsForDocument } from '../dx/vscodeAdapters.js';
import { inspectImportAssistance, type InspectImportAssistanceCandidate } from '../importAssist/inspectImportAssistance.js';
import { buildDeliveryManifestCsv } from '../manifest/collectDeliveryManifest.js';
import { detectRegions } from '../search/regionDetector.js';
import { runFind, runSelect } from './navigateCommands.js';
import { extractImages, extractTable, formatImageDiagnostics } from './extract.js';
import { RenderError, renderDocumentHtml, renderDocumentMarkdown } from './render.js';

const USAGE = `Usage: mmi <command> [options]

Commands:
  inspect <source>          List sheets and table regions of a workbook/CSV (structure only by default;
                            --json adds "candidates": the same regions as Semantic Candidates with status,
                            method, provenance and fingerprint)
      --values <n>            also print the first n body rows of each region
      --from <doc.md>         write suggested references relative to this document
      --import-assist          also show grid-layout import roles, revalidated reference proposals and cautions
      --ledger <file>         import ledger (default: <root>/mmi-ledger.json when ledger filtering is used)
      --similarity-evidence <file>
                              optional research similarity sidecar; display only, never import identity
      --unimported            show only occurrences never imported (duplicates remain separate)
      --exclude-imported      hide exact imported occurrences; keep changed/stale/duplicate/unimported
                            For .xlsx/.xlsm it also lists embedded pictures (sheet, anchor, format, size,
                            digest, nearest table) and names any that cannot be read.
  extract <source>          Extract one reviewed Candidate as a standard asset without modifying the source
      --image <n|all>         workbook picture number shown by inspect, or all
      --table <range>         exact detected table Candidate range (requires --sheet)
      --sheet <name>          sheet for --table
                            Exactly one of --image or --table is required
      --out-dir <dir>         assets folder (default: assets); files are content-addressed
      --from <doc.md>         provenance/source labels are relative to this document
      --ledger <file>         import ledger (default: <root>/mmi-ledger.json)
  select <workbook>         Print the reference for a table chosen by name, with columns/rows chosen by heading
      --table <name|range>    Excel table, name, title or A1 range (required)
      --sheet <name>  --columns <h1,h2>  --contains <text> [--in <heading>]  --first <n>
      --from <doc.md>         write the reference relative to this document
  find <description...>     Search workbooks under --root for tables matching a description
  select <workbook>         Print the reference for a table chosen by name, columns/rows by heading
      --table <name|range>    Excel table, name, title or A1 range (required)
      --sheet <name>  --columns <h1,h2>  --contains <text> [--in <heading>]  --first <n>
      --from <doc.md>         write the reference relative to this document
  find <description...>     Search workbooks under --root for tables matching a description
  check <path...>           Validate MMI references in Markdown files or directories
                            (exit code 1 when any error is found)
  render <doc.md>           Expand references into Markdown tables (default) or HTML
      --to md|html
  materialize <doc.md>      Write a source-independent Markdown projection for detaching
      -o, --out <file>        detached Markdown output (required; must differ from source)
      --attachments-dir <dir> directory for card-sized table attachments
      --assets-dir <dir>      directory for copied local image assets
      --ledger <file>          verify adopted extracted Candidates against this ledger
  detach-check <doc.md>     Verify a Markdown artifact has no MMI refs, unresolved cards,
                            broken local links or links outside --root
  manifest <doc.md>         List references that fall back to 別紙 cards as CSV
  handoff <source>          Build a local-only evidence package/prompt for a user-chosen external LLM
      --task <text>           work to ask for (required)
      --document <doc.md>     include unresolved MMI diagnostics from this Markdown document
      --include-values        explicitly include Candidate Claim values and Evidence details
                            Default output is a human-readable prompt; --json emits the evidence package
  validate-proposal <mmi>   Revalidate one returned MMI notation locally; never auto-apply it
      --package <file>        locally generated mmi.ai-handoff/v1 JSON package (required)
      --document <doc.md>     Markdown path used as the proposal reference base (required)
                            Exit 0 only when every Authority check passes; --json emits the receipt
  validate-selection <json> Revalidate one returned Candidate-selection proposal JSON; review-only
      --package <file>        locally generated mmi.ai-handoff/v1 JSON package (required)
                            Exit 0 only for an allowlisted accepted-for-review selection
  validate-transformation <json>
                            Revalidate one returned Candidate transformation proposal JSON; review-only
      --package <file>        locally generated mmi.ai-handoff/v1 JSON package (required)
      --document <doc.md>     Markdown path used for source resolution/preview (required)
                            Exit 0 only for an accepted-for-review local plan; nothing is applied

Common options:
  --root <dir>              workspace boundary for references (default: current directory)
  --json                    machine-readable output
  -o, --out <file>          write output to a file instead of stdout
  -h, --help`;

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: 'string' },
      json: { type: 'boolean', default: false },
      out: { type: 'string', short: 'o' },
      to: { type: 'string', default: 'md' },
      values: { type: 'string', default: '0' },
      from: { type: 'string' },
      image: { type: 'string' },
      'out-dir': { type: 'string', default: 'assets' },
      'attachments-dir': { type: 'string' },
      'assets-dir': { type: 'string' },
      ledger: { type: 'string' },
      'similarity-evidence': { type: 'string' },
      unimported: { type: 'boolean', default: false },
      'exclude-imported': { type: 'boolean', default: false },
      'import-assist': { type: 'boolean', default: false },
      table: { type: 'string' },
      sheet: { type: 'string' },
      columns: { type: 'string' },
      contains: { type: 'string' },
      in: { type: 'string' },
      first: { type: 'string' },
      task: { type: 'string' },
      package: { type: 'string' },
      document: { type: 'string' },
      'include-values': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.help || !command) {
    console.log(USAGE);
    return command || values.help ? 0 : 2;
  }
  const root = path.resolve(values.root ?? process.cwd());
  const emit = (text: string) => (values.out ? fs.writeFileSync(values.out, text) : process.stdout.write(text.endsWith('\n') ? text : `${text}\n`));

  switch (command) {
    case 'inspect': {
      if (args.length !== 1) return usageError('inspect takes one source file');
      if (values.unimported && values['exclude-imported']) {
        return usageError('inspect accepts only one of --unimported or --exclude-imported');
      }
      const absoluteSource = path.resolve(args[0]);
      const raw = inspectSource(absoluteSource, Number(values.values) || 0, values.from);
      if (values['import-assist']) {
        raw.importAssistance = inspectImportAssistance(absoluteSource, values.from);
      }
      const ledgerPath = path.resolve(root, values.ledger ?? DEFAULT_LEDGER_FILE);
      const filter: CandidateLedgerFilter = values.unimported
        ? 'unimported'
        : values['exclude-imported']
          ? 'exclude-imported'
          : 'all';
      const similarityEvidencePath = values['similarity-evidence']
        ? path.resolve(root, values['similarity-evidence'])
        : undefined;
      const useLedger = Boolean(
        values.ledger
        || values.unimported
        || values['exclude-imported']
        || similarityEvidencePath
        || fs.existsSync(ledgerPath)
      );
      const result = useLedger
        ? applyLedgerView(raw, absoluteSource, ledgerPath, filter, similarityEvidencePath)
        : raw;
      emit(values.json ? JSON.stringify(result, null, 2) : formatInspect(result));
      return 0;
    }
    case 'extract': {
      if (args.length !== 1) return usageError('extract takes one source file');
      if (Boolean(values.image) === Boolean(values.table)) {
        return usageError('extract needs exactly one of --image <n|all> or --table <range>');
      }
      const sourcePath = path.resolve(args[0]);
      const outDir = path.resolve(values['out-dir'] ?? 'assets');
      const ledgerPath = path.resolve(root, values.ledger ?? DEFAULT_LEDGER_FILE);

      if (values.table) {
        if (!values.sheet) return usageError('extract --table needs --sheet <name>');
        const result = extractTable({
          sourcePath,
          sheet: values.sheet,
          range: values.table,
          outDir,
          fromDocument: values.from,
          ledgerPath,
        });
        if (values.json) emit(JSON.stringify(result, null, 2));
        else if (result.extracted) emit(result.extracted.markdown);
        for (const problem of result.problems) {
          console.error(`mmi: ${problem.code}: ${problem.message}`);
        }
        return result.problems.length > 0 ? 1 : 0;
      }

      const result = extractImages({
        sourcePath,
        selection: values.image!,
        outDir,
        fromDocument: values.from,
        ledgerPath,
      });
      if (values.json) emit(JSON.stringify(result, null, 2));
      else if (result.extracted.length > 0) emit(result.extracted.map((item) => item.markdown).join('\n\n'));
      for (const problem of result.problems) console.error(`mmi: ${problem.code}${problem.ordinal ? ` (image ${problem.ordinal})` : ''}: ${problem.message}`);
      return result.problems.length > 0 ? 1 : 0;
    }
    case 'select':
      return runSelect(args, { ...values, json: values.json }, { out: emit, err: (text) => console.error(text), cwd: process.cwd() });
    case 'find':
      return runFind(args, { ...values, json: values.json }, { out: emit, err: (text) => console.error(text), cwd: process.cwd() });
    case 'check': {
      if (args.length === 0) return usageError('check needs at least one file or directory');
      const problems = await checkPaths(args.flatMap(collectMarkdownFiles), root);
      const errors = problems.filter((problem) => problem.severity === 'error').length;
      emit(values.json
        ? JSON.stringify({ errors, problems }, null, 2)
        : problems.map((p) => `${p.file}:${p.line}:${p.column} ${p.severity} ${p.code} ${p.message}`).concat(`${errors} error(s), ${problems.length - errors} other problem(s)`).join('\n'));
      return errors > 0 ? 1 : 0;
    }
    case 'render': {
      if (args.length !== 1) return usageError('render takes one Markdown file');
      if (values.to !== 'md' && values.to !== 'html') return usageError('--to must be md or html');
      const options = { markdownFilePath: path.resolve(args[0]), workspaceRoot: root };
      try {
        emit(values.to === 'html' ? renderDocumentHtml(options) : renderDocumentMarkdown(options));
      } catch (error) {
        if (!(error instanceof RenderError)) throw error;
        console.error(error.message);
        return 1;
      }
      return 0;
    }
    case 'materialize': {
      if (args.length !== 1) return usageError('materialize takes one Markdown file');
      if (!values.out) return usageError('materialize needs -o, --out <file>');
      const sourceDocument = path.resolve(args[0]);
      const outputDocument = path.resolve(values.out);
      if (sourceDocument === outputDocument) {
        return usageError('materialize output must differ from the source Markdown file');
      }
      if (!handoffPathWithinRoot(sourceDocument, root) || !handoffPathWithinRoot(outputDocument, root)) {
        return usageError('materialize source and output must stay within --root workspace');
      }
      const attachmentsDirectory = values['attachments-dir']
        ? path.resolve(values['attachments-dir'])
        : path.join(path.dirname(outputDocument), 'mmi-materialized');
      const assetsDirectory = values['assets-dir']
        ? path.resolve(values['assets-dir'])
        : path.join(path.dirname(outputDocument), 'mmi-assets');
      if (!handoffPathWithinRoot(attachmentsDirectory, root)) {
        return usageError('materialize --attachments-dir must stay within --root workspace');
      }
      if (!handoffPathWithinRoot(assetsDirectory, root)) {
        return usageError('materialize --assets-dir must stay within --root workspace');
      }
      const freshness = checkExtractedProvenanceFreshness({
        markdownFilePath: sourceDocument,
        workspaceRoot: root,
        ledgerPath: path.resolve(root, values.ledger ?? DEFAULT_LEDGER_FILE),
      });
      const result = materializeDocument({
        markdownFilePath: sourceDocument,
        workspaceRoot: root,
        outputDocumentPath: outputDocument,
        attachmentsDirectory,
        assetsDirectory,
      });
      const fileCollisions = result.files.filter((file) =>
        fs.existsSync(file.absolutePath)
        && fs.readFileSync(file.absolutePath, 'utf8') !== file.content);
      const assetCollisions = result.assets.filter((asset) =>
        fs.existsSync(asset.absolutePath)
        && !fs.readFileSync(asset.absolutePath).equals(asset.bytes));
      for (const file of fileCollisions) {
        console.error(`mmi: MMI_DETACH_NAME_COLLISION: ${file.absolutePath} exists with different content; materialization was not written`);
      }
      for (const asset of assetCollisions) {
        console.error(`mmi: MMI_DETACH_NAME_COLLISION: ${asset.absolutePath} exists with different content; materialization was not written`);
      }
      for (const problem of freshness.problems) {
        console.error(`mmi: ${problem.code} line ${problem.line}: ${problem.message}`);
      }
      for (const problem of result.problems) {
        console.error(`mmi: ${problem.code} line ${problem.line}: ${problem.message}`);
      }
      const collisions = [
        ...fileCollisions.map((file) => file.relativePath),
        ...assetCollisions.map((asset) => asset.relativePath),
      ];
      const writeAllowed = collisions.length === 0 && freshness.errors === 0;
      const summary = {
        output: path.relative(process.cwd(), outputDocument).split(path.sep).join('/'),
        attachments: result.files.map((file) => file.relativePath),
        assets: result.assets.map((asset) => ({
          path: asset.relativePath,
          digest: asset.digest,
        })),
        freshness,
        problems: result.problems,
        collisions,
        written: writeAllowed,
        detachable: writeAllowed && result.problems.length === 0,
      };
      if (writeAllowed) {
        fs.mkdirSync(path.dirname(outputDocument), { recursive: true });
        fs.writeFileSync(outputDocument, result.markdown);
        for (const file of result.files) {
          fs.mkdirSync(path.dirname(file.absolutePath), { recursive: true });
          fs.writeFileSync(file.absolutePath, file.content);
        }
        for (const asset of result.assets) {
          fs.mkdirSync(path.dirname(asset.absolutePath), { recursive: true });
          fs.writeFileSync(asset.absolutePath, asset.bytes);
        }
      }
      if (values.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      else console.log(`materialized: ${summary.output} (${summary.attachments.length} table attachment(s), ${summary.assets.length} asset(s), ${freshness.errors} freshness error(s), ${result.problems.length} unresolved, ${summary.collisions.length} collision(s), written=${summary.written})`);
      return summary.detachable ? 0 : 1;
    }
    case 'detach-check': {
      if (args.length !== 1) return usageError('detach-check takes one Markdown file');
      const markdownFilePath = path.resolve(args[0]);
      if (!handoffPathWithinRoot(markdownFilePath, root)) {
        return usageError('detach-check document must stay within --root workspace');
      }
      const result = checkDetachedDocument({ markdownFilePath, workspaceRoot: root });
      if (values.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        const lines = result.problems.map((problem) =>
          `${problem.file ? `${problem.file}:` : ''}${problem.line} ${problem.code} ${problem.message}`);
        process.stdout.write(`${[...lines, `${result.errors} detach error(s)`].join('\n')}\n`);
      }
      return result.errors > 0 ? 1 : 0;
    }
    case 'manifest': {
      if (args.length !== 1) return usageError('manifest takes one Markdown file');
      const markdownFilePath = path.resolve(args[0]);
      const { records, csvText } = buildDeliveryManifestCsv({
        markdownText: fs.readFileSync(markdownFilePath, 'utf8'), markdownFilePath, workspaceRoot: root,
      });
      emit(values.json ? JSON.stringify(records, null, 2) : csvText);
      return 0;
    }
    case 'handoff': {
      if (args.length !== 1) return usageError('handoff takes one source file');
      if (!values.task?.trim()) return usageError('handoff needs --task <text>');
      const absoluteSource = path.resolve(args[0]);
      const documentPath = values.document ? path.resolve(values.document) : undefined;
      if (!handoffPathWithinRoot(absoluteSource, root)) {
        return usageError('handoff source must stay within --root workspace');
      }
      if (documentPath && !handoffPathWithinRoot(documentPath, root)) {
        return usageError('handoff --document must stay within --root workspace');
      }
      const inspected = inspectSource(absoluteSource, 0, documentPath);
      const diagnostics = documentPath
        ? await checkPaths([documentPath], root)
        : [];
      const handoff = createAiHandoffPackage({
        task: values.task,
        candidates: inspected.candidates,
        diagnostics,
        includeValues: values['include-values'],
      });
      emit(values.json
        ? JSON.stringify(handoff, null, 2)
        : renderAiHandoffPrompt(handoff));
      return 0;
    }
    case 'validate-proposal': {
      if (args.length !== 1) return usageError('validate-proposal takes one MMI notation');
      if (!values.package) return usageError('validate-proposal needs --package <file>');
      if (!values.document) return usageError('validate-proposal needs --document <doc.md>');
      const packagePath = path.resolve(values.package);
      const documentPath = path.resolve(values.document);
      if (!handoffPathWithinRoot(packagePath, root)) {
        return usageError('validate-proposal --package must stay within --root workspace');
      }
      if (!handoffPathWithinRoot(documentPath, root)) {
        return usageError('validate-proposal --document must stay within --root workspace');
      }
      const handoff = parseAiHandoffPackage(fs.readFileSync(packagePath, 'utf8'));
      const validation = await validateAiHandoffNotationProposal({
        handoff,
        rawNotation: args[0],
        markdownFilePath: documentPath,
        workspaceRoot: root,
      });
      emit(values.json
        ? JSON.stringify(validation, null, 2)
        : formatAiHandoffProposalValidation(validation));
      return validation.status === 'accepted' ? 0 : 1;
    }
    case 'validate-selection': {
      if (args.length !== 1) return usageError('validate-selection takes one proposal JSON file');
      if (!values.package) return usageError('validate-selection needs --package <file>');
      const proposalPath = path.resolve(args[0]);
      const packagePath = path.resolve(values.package);
      if (!handoffPathWithinRoot(proposalPath, root)) {
        return usageError('validate-selection proposal must stay within --root workspace');
      }
      if (!handoffPathWithinRoot(packagePath, root)) {
        return usageError('validate-selection --package must stay within --root workspace');
      }
      const handoff = parseAiHandoffPackage(fs.readFileSync(packagePath, 'utf8'));
      const proposal = readJsonFile(proposalPath, 'Candidate-selection proposal');
      const validation = validateAiHandoffCandidateSelection(handoff, proposal);
      emit(values.json
        ? JSON.stringify(validation, null, 2)
        : formatReviewOnlyValidation('candidate selection', validation.status, validation.checks));
      return validation.status === 'accepted-for-review' ? 0 : 1;
    }
    case 'validate-transformation': {
      if (args.length !== 1) return usageError('validate-transformation takes one proposal JSON file');
      if (!values.package) return usageError('validate-transformation needs --package <file>');
      if (!values.document) return usageError('validate-transformation needs --document <doc.md>');
      const proposalPath = path.resolve(args[0]);
      const packagePath = path.resolve(values.package);
      const documentPath = path.resolve(values.document);
      if (!handoffPathWithinRoot(proposalPath, root)) {
        return usageError('validate-transformation proposal must stay within --root workspace');
      }
      if (!handoffPathWithinRoot(packagePath, root)) {
        return usageError('validate-transformation --package must stay within --root workspace');
      }
      if (!handoffPathWithinRoot(documentPath, root)) {
        return usageError('validate-transformation --document must stay within --root workspace');
      }
      const handoff = parseAiHandoffPackage(fs.readFileSync(packagePath, 'utf8'));
      const proposal = readJsonFile(proposalPath, 'transformation proposal');
      const validation = await validateAiHandoffTransformationProposal({
        handoff,
        proposal,
        markdownFilePath: documentPath,
        workspaceRoot: root,
      });
      emit(values.json
        ? JSON.stringify(validation, null, 2)
        : formatReviewOnlyValidation('transformation', validation.status, validation.checks));
      return validation.status === 'accepted-for-review' ? 0 : 1;
    }
    default:
      return usageError(`unknown command: ${command}`);
  }
}

function usageError(message: string): number {
  console.error(`mmi: ${message}\n\n${USAGE}`);
  return 2;
}

function readJsonFile(filepath: string, label: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function formatReviewOnlyValidation(
  label: string,
  status: string,
  checks: readonly { check: string; status: string; code: string; detail?: string }[],
): string {
  return [
    `${label}: ${status}`,
    ...checks.map((check) =>
      `  ${check.check}: ${check.status} ${check.code}${check.detail ? ` - ${check.detail}` : ''}`),
  ].join('\n');
}

function formatAiHandoffProposalValidation(
  validation: Awaited<ReturnType<typeof validateAiHandoffNotationProposal>>,
): string {
  return [
    `proposal: ${validation.status}`,
    ...validation.checks.map((check) =>
      `  ${check.check}: ${check.status} ${check.code}${check.detail ? ` - ${check.detail}` : ''}`),
  ].join('\n');
}

function handoffPathWithinRoot(target: string, root: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  let checkedRoot = resolvedRoot;
  let checkedTarget = resolvedTarget;
  try {
    checkedRoot = fs.realpathSync(resolvedRoot);
  } catch {
    // Missing roots fail later through normal source/document loading.
  }
  try {
    checkedTarget = fs.realpathSync(resolvedTarget);
  } catch {
    // Missing targets fail later through normal source/document loading.
  }
  return isPathWithinBoundary(checkedTarget, checkedRoot);
}

export interface InspectRegion {
  a1: string;
  rows: number;
  columns: number;
  title?: string;
  headers?: string[];
  headerConfidence: string;
  notes: string[];
  reference: string;
  sample?: string[][];
}

export interface InspectResult {
  source: string;
  sheets: { name: string; usedRange?: string; regions: InspectRegion[] }[];
  /** The same structure as Semantic Candidates (issue-0193). `--json` only; the text output is unchanged. */
  candidates: Candidate[];
  /** Embedded pictures of an .xlsx/.xlsm (empty for other sources). */
  images: InspectImage[];
  /** Pictures or drawings that could not be read, by name. */
  imageDiagnostics: ImageDiagnostic[];
  /**
   * Optional non-authoritative import assistance. Kept separate from
   * Semantic Candidates so inferred roles never become observed facts.
   */
  importAssistance?: InspectImportAssistanceCandidate[];
  /** Present when the CLI joined Candidates with an import ledger. */
  ledger?: InspectLedgerView;
}

export interface InspectLedgerCandidate {
  kind: Candidate['kind'];
  sheet?: string;
  place: string;
  state: LedgerState;
  staleClaims?: string[];
  /** Evidence-only predecessor proposals; never an automatic identity/review transfer. */
  lineageCandidates?: LineageCandidate[];
  /** Research/provider scores; never used as exact import/identity evidence. */
  researchScores?: readonly ProviderScore[];
  /** Explicit pairwise similarity comparisons loaded from a research sidecar. */
  similarityEvidence?: readonly CandidateSimilarityEvidenceEntry[];
}

export interface InspectLedgerView {
  file: string;
  filter: CandidateLedgerFilter;
  candidates: InspectLedgerCandidate[];
  similarityEvidenceFile?: string;
}

export interface InspectImage {
  ordinal: number;
  sheet: string;
  name?: string;
  description?: string;
  range?: string;
  anchorKind: string;
  format: string;
  bytes: number;
  digest: string;
  extractable: boolean;
  nearbyTable?: { range: string; relation: string; gap: number };
}

export function inspectSource(absolutePath: string, sampleRows: number, fromDocument?: string): InspectResult {
  const workbook = loadWorkbook({ absolutePath });
  const sourceDigest = readSourceFileIdentity(absolutePath).digest;
  const isPackage = /\.(xlsx|xlsm)$/iu.test(absolutePath);
  const imageRead = isPackage
    ? readExcelImages(fs.readFileSync(absolutePath))
    : {
        images: [],
        diagnostics: /\.xls$/iu.test(absolutePath)
          ? [{ code: 'MMI_IMAGE_PACKAGE_UNSUPPORTED' as const, severity: 'warning' as const, message: 'binary .xls: embedded pictures are not read' }]
          : [],
      };
  const detected = Object.entries(workbook.sheets).map(([name, sheet]) => ({ name, sheet, regions: detectRegions(name, sheet, { maxValueSample: 0 }) }));
  const tablesBySheet: Record<string, TableRect[]> = Object.fromEntries(
    detected.map(({ name, regions }) => [name, regions.map((r) => ({ a1: r.a1, startRow: r.range.startRow, startCol: r.range.startCol, endRow: r.range.endRow, endCol: r.range.endCol }))]),
  );
  const base = fromDocument ? path.dirname(path.resolve(fromDocument)) : process.cwd();
  let relative = path.relative(base, absolutePath).split(path.sep).join('/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return {
    source: relative,
    candidates: [
      ...Object.entries(workbook.sheets).flatMap(([sheetName, sheet]) => tableCandidates({ source: relative, sourceDigest, sheetName, sheet })),
      ...imageCandidates({ source: relative, sourceDigest, images: imageRead.images, tablesBySheet }),
    ],
    images: imageRead.images.map((image) => {
      const near = relationToTables(image, tablesBySheet[image.sheet] ?? []);
      return {
        ordinal: image.ordinal,
        sheet: image.sheet,
        ...(image.name ? { name: image.name } : {}),
        ...(image.description ? { description: image.description } : {}),
        ...(image.range ? { range: image.range } : {}),
        anchorKind: image.anchor.kind,
        format: image.format,
        bytes: image.bytes,
        digest: image.digest,
        extractable: image.extractable,
        ...(near ? { nearbyTable: { range: near.table.a1, relation: near.relation, gap: near.gap } } : {}),
      };
    }),
    imageDiagnostics: imageRead.diagnostics,
    sheets: Object.entries(workbook.sheets).map(([name, sheet]) => ({
      name,
      ...(sheet.usedRange ? { usedRange: a1Of(sheet.usedRange) } : {}),
      regions: detectRegions(name, sheet, { maxValueSample: 0 }).map((region) => {
        const header = region.headerConfidence === 'likely' ? '?header=first' : '';
        return {
          a1: region.a1,
          rows: region.range.endRow - region.range.startRow + 1,
          columns: region.range.endCol - region.range.startCol + 1,
          ...(region.title ? { title: region.title } : {}),
          ...(region.headers ? { headers: region.headers } : {}),
          headerConfidence: region.headerConfidence,
          notes: region.reasons,
          reference: `![[${relative}#${name}|${region.a1}${header}]]`,
          ...(sampleRows > 0 ? { sample: sliceRegion(sheet, region.a1).slice(region.headers ? 1 : 0, (region.headers ? 1 : 0) + sampleRows) } : {}),
        };
      }),
    })),
  };
}


function candidateDisplayKey(candidate: Candidate): string {
  return `${candidate.kind}\u0000${candidate.locator.sheet ?? ''}\u0000${placeOf(candidate)}`;
}

function applyLedgerView(
  result: InspectResult,
  absoluteSource: string,
  ledgerPath: string,
  filter: CandidateLedgerFilter,
  similarityEvidencePath?: string,
): InspectResult {
  const ledger = readLedger(ledgerPath);
  const similarity = similarityEvidencePath
    ? {
        document: readCandidateSimilarityEvidence(similarityEvidencePath),
        evidencePath: similarityEvidencePath,
      }
    : undefined;
  const view = candidateLedgerView(
    result.candidates,
    ledger,
    ledgerPath,
    absoluteSource,
    filter,
    similarity,
  );
  const allowed = new Set(view.map(({ candidate }) => candidateDisplayKey(candidate)));
  return {
    ...result,
    candidates: view.map(({ candidate }) => candidate),
    images: result.images.filter((image) => {
      const place = image.range ?? `name:${image.name ?? ''}`;
      return allowed.has(`image\u0000${image.sheet}\u0000${place}`);
    }),
    sheets: result.sheets.map((sheet) => ({
      ...sheet,
      regions: sheet.regions.filter((region) =>
        allowed.has(`table-range\u0000${sheet.name}\u0000${region.a1}`)),
    })),
    ledger: {
      file: path.relative(process.cwd(), ledgerPath).split(path.sep).join('/') || path.basename(ledgerPath),
      filter,
      ...(similarityEvidencePath
        ? { similarityEvidenceFile: path.relative(process.cwd(), similarityEvidencePath).split(path.sep).join('/') || path.basename(similarityEvidencePath) }
        : {}),
      candidates: view.map(({ candidate, ledgerState, staleClaims, lineageCandidates, researchScores, similarityEvidence }) => ({
        kind: candidate.kind,
        ...(candidate.locator.sheet ? { sheet: candidate.locator.sheet } : {}),
        place: placeOf(candidate),
        state: ledgerState,
        ...(staleClaims ? { staleClaims } : {}),
        ...(lineageCandidates.length > 0 ? { lineageCandidates } : {}),
        ...(researchScores.length > 0 ? { researchScores } : {}),
        ...(similarityEvidence.length > 0 ? { similarityEvidence } : {}),
      })),
    },
  };
}

function a1Of(range: { startRow: number; startCol: number; endRow: number; endCol: number }): string {
  return XLSX.utils.encode_range({ s: { r: range.startRow, c: range.startCol }, e: { r: range.endRow, c: range.endCol } });
}

function formatInspect(result: InspectResult): string {
  const ledgerSuffix = (kind: Candidate['kind'], sheet: string, place: string): string => {
    const item = (result.ledger?.candidates ?? []).find(
      (candidate) => candidate.kind === kind
        && (candidate.sheet ?? '') === sheet
        && candidate.place === place,
    );
    if (!item) return '';
    const claims = item.staleClaims?.length ? ` [stale: ${item.staleClaims.join(', ')}]` : '';
    const lineage = item.lineageCandidates?.length ? ` [lineage: ${item.lineageCandidates.length}]` : '';
    const scores = item.researchScores?.length ? ` [research scores: ${item.researchScores.length}]` : '';
    const similarity = item.similarityEvidence?.length ? ` [similarity: ${item.similarityEvidence.length}]` : '';
    return `  ledger: ${item.state}${claims}${lineage}${scores}${similarity}`;
  };
  const lines = [`source: ${result.source}`];
  if (result.ledger) lines.push(`ledger: ${result.ledger.file} (${result.ledger.filter})`);
  if (result.importAssistance) {
    lines.push('', 'import assistance (non-authoritative):');
    for (const item of result.importAssistance) {
      const proposal = item.proposal ? `  proposal: ${item.proposal}` : '';
      const cautions = item.cautions.length > 0 ? `  cautions: ${item.cautions.map((c) => c.code).join(', ')}` : '';
      lines.push(`  ${item.sheet}!${item.range}  role: ${item.role}${proposal}${cautions}`);
    }
  }
  for (const sheet of result.sheets) {
    lines.push('', `sheet: ${sheet.name}${sheet.usedRange ? ` (used ${sheet.usedRange})` : ''}`);
    if (sheet.regions.length === 0) lines.push('  (no table regions)');
    for (const region of sheet.regions) {
      lines.push(`  ${region.a1}  ${region.rows} rows x ${region.columns} cols  header: ${region.headerConfidence}${region.title ? `  title: ${region.title}` : ''}${ledgerSuffix('table-range', sheet.name, region.a1)}`);
      if (region.headers) lines.push(`    columns: ${region.headers.map((h, i) => `${XLSX.utils.encode_col(i)}=${h}`).join(', ')}`);
      if (region.notes.length) lines.push(`    notes: ${region.notes.join(', ')}`);
      lines.push(`    ${region.reference}`);
      for (const row of region.sample ?? []) lines.push(`    | ${row.join(' | ')} |`);
    }
    for (const image of result.images.filter((item) => item.sheet === sheet.name)) {
      const near = image.nearbyTable ? `  near table ${image.nearbyTable.range} (${image.nearbyTable.relation}, gap ${image.nearbyTable.gap})` : '';
      const place = image.range ?? `name:${image.name ?? ''}`;
      lines.push(`  image #${image.ordinal}  ${image.range ?? '(no cell anchor)'}  ${image.format}  ${image.bytes} bytes  ${image.digest.slice(0, 19)}…${image.name ? `  "${image.name}"` : ''}${near}${image.extractable ? '' : '  (not extractable)'}${ledgerSuffix('image', sheet.name, place)}`);
    }
  }
  if (result.imageDiagnostics.length > 0) lines.push('', 'image problems:', ...formatImageDiagnostics(result.imageDiagnostics).map((line) => `  ${line}`));
  return lines.join('\n');
}

export interface CheckProblem {
  file: string;
  line: number;
  column: number;
  severity: string;
  code: string;
  message: string;
}

export async function checkPaths(files: string[], root: string): Promise<CheckProblem[]> {
  const cache = new WorkbookCache<WorkbookData>();
  const problems: CheckProblem[] = [];
  for (const file of files) {
    const absolute = path.resolve(file);
    const items = await createDiagnosticsForDocument(fs.readFileSync(absolute, 'utf8'), absolute, root, {
      fileExists: async (filepath) => fs.existsSync(filepath) && fs.statSync(filepath).isFile(),
      readFile: async (filepath) => fs.readFileSync(filepath),
      readWorkbookSheetNames: async (filepath) => Object.keys(loadWorkbook({ absolutePath: filepath, cache }).sheets),
    });
    for (const { diagnostic, range } of items) {
      problems.push({
        file: path.relative(process.cwd(), absolute).split(path.sep).join('/'),
        line: range.start.line + 1,
        column: range.start.character + 1,
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
      });
    }
  }
  return problems;
}

function collectMarkdownFiles(target: string): string[] {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .flatMap((entry) => {
      const child = path.join(target, entry.name);
      return entry.isDirectory() ? collectMarkdownFiles(child) : entry.name.toLowerCase().endsWith('.md') ? [child] : [];
    });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(`mmi: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  });
}
