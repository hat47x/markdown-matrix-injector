#!/usr/bin/env node
/**
 * `mmi` -- the MMI engine without VS Code, for AI agents, CI and scripts.
 * Source workbooks/documents are never modified. Commands that materialize,
 * extract or import write only to explicit output, asset, attachment and ledger paths.
 */
import { matchSourceIds } from '../application/matchSourceIds.js';
import { observeSourceCells } from '../application/observeSourceCells.js';
import { readBoundedSourceBytes } from '../core/readBoundedSourceBytes.js';
import { inventoryDesignSources } from '../application/designSourceInventory.js';
import { auditDeliveryReferences } from '../application/deliveryAudit.js';
import { runSnapshot } from './snapshot.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readHtmlFragments } from '../adapters/htmlFragmentAdapter.js';
import { readDocx, type DocxDiagnostic } from '../adapters/docxSourceAdapter.js';
import { checkExpectedSourceDigest, createSourceIdentityFromBytes } from '../core/sourceIdentity.js';
import XLSX from 'xlsx';
import { WorkbookCache } from '../cache/workbookCache.js';
import { checkDetachedDocument } from '../application/detachCheck.js';
import {
  buildProvenanceReport,
  formatProvenanceReport,
} from '../application/provenanceReport.js';
import { provenanceReportSchemaJson } from '../core/provenanceReportContract.js';
import { reviewBasisSchemaJson } from '../core/reviewBasisContract.js';
import { DEFAULT_REVIEW_BASIS_FILE, recordReviewBasis } from '../application/reviewBasis.js';
import { extractHtmlFragment } from '../application/extractHtmlFragment.js';
import { extractDocxImage, extractDocxTable } from '../application/extractDocx.js';
import { previewHtmlDecomposition } from '../application/htmlDecompositionPreview.js';
import { commitHtmlDecomposition } from '../application/commitHtmlDecomposition.js';
import { auditHtmlDecomposition } from '../application/auditHtmlDecomposition.js';
import {
  planHtmlDecomposition,
  type HtmlPlanSelection,
} from '../application/htmlDecompositionPlan.js';
import {
  collectStandaloneTreeCandidates,
} from '../application/sourceCandidateInventory.js';
import {
  collectWorkbookCandidates,
} from '../application/workbookCandidateInventory.js';
import { checkExtractedProvenanceFreshness } from '../application/detachFreshness.js';
import { materializeDocument } from '../application/materialize.js';
import {
  analyzeSourceImpact,
  type SourceImpactReport,
} from '../application/sourceImpact.js';
import { runPortableCoreRequest } from '../application/portableCoreProtocol.js';
import type {
  ChoiceListDiagnostic,
} from '../adapters/excelChoiceListAdapter.js';
import type {
  NoteDiagnostic,
} from '../adapters/excelNoteAdapter.js';
import type {
  LinkDiagnostic,
  LinkTargetKind,
} from '../adapters/excelLinkAdapter.js';
import {
  readExcelImages,
  relationToTables,
  type ImageDiagnostic,
} from '../adapters/excelImageAdapter.js';
import {
  DEFAULT_FLAT_TEXT_TREE_METHODS,
  type FlatTextTreeMethod,
} from '../adapters/flatTextTreeStructuralizer.js';
import type {
  TabularHierarchyConfig,
} from '../adapters/tabularHierarchyAdapter.js';
import type { Candidate, ProviderScore } from '../core/candidate.js';
import {
  cognitiveArtifactManifestSchemaJson,
  parseCognitiveArtifactManifest,
  resolveCognitiveArtifact,
  type CognitiveArtifactManifestV0,
  type CognitiveArtifactResolution,
  type RuntimeManagedArtifact,
} from '../core/cognitiveArtifact.js';
import {
  SEMANTIC_CANDIDATE_CONTRACT,
  semanticCandidateSchemaJson,
} from '../core/candidateContract.js';
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
import { isPathWithinBoundary, resolveSourcePath } from '../core/pathResolver.js';
import { findUnknownProseIds, UNKNOWN_PROSE_ID_CODE } from '../application/proseIdCheck.js';
import { referencedSheets, unknownIdMessage } from '../application/referencedSheets.js';
import {
  importLedgerSchemaJson,
  reviewDecisionsSchemaJson,
} from '../core/reviewContracts.js';
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
import { readWorkbookStructure } from '../importAssist/workbookStructure.js';
import { inspectImportAssistance, type InspectImportAssistanceCandidate } from '../importAssist/inspectImportAssistance.js';
import { writeWorkbookImportDraft } from '../importAssist/importMaterialization.js';
import { intakeSourceFile, pathWithinBoundaryForWrite } from '../importAssist/sourceIntake.js';
import { buildDeliveryManifestCsv } from '../manifest/collectDeliveryManifest.js';
import {
  RegionSnapshotError,
  renderLibreOfficeRegionSnapshot,
} from '../snapshot/libreOfficeRegionSnapshot.js';
import {
  renderNativeSvgRegionSnapshot,
} from '../snapshot/nativeSvgRegionSnapshot.js';
import { detectTableRegions, regionReference } from '../importAssist/tableRegions.js';
import {
  discoverLocalEmbeddingModels,
  runtimeManagedArtifactFromEmbeddingModel,
} from '../search/semantic/runtimeDiscovery.js';
import { readBuildIdentity } from './buildIdentity.js';
import { runFind, runSelect } from './navigateCommands.js';
import { cliErrorText, cliMessageLanguage } from './messageLanguage.js';
import { extractImages, extractTable, formatImageDiagnostics } from './extract.js';
import {
  extractFlatTextTree,
  extractJsonTree,
  extractTabularHierarchyTree,
  extractXmlTree,
  extractYamlTree,
} from './extractTree.js';
import { RenderError, renderDocumentHtml, renderDocumentMarkdown } from './render.js';

export const SEMANTIC_CANDIDATE_SCHEMA_NAME =
  SEMANTIC_CANDIDATE_CONTRACT;

const USAGE = `Usage: mmi <command> [options]

Commands:
  schema <contract>        Print a public JSON Schema.
                            candidate        mmi.semantic-candidate/v1
                            ledger           mmi.ledger/v1
                            review-decisions mmi.review-decisions/v1
                            provenance-report mmi.provenance-report/v1
                            review-basis     mmi.review-basis/v1
                            cognitive-artifact mmi.cognitive-artifact-manifest/v0
  core <request.json|->     Execute one mmi.portable-core-request/v1 and emit JSON.
                            Use - to read the request from stdin; source bytes are embedded in the request.
                            This boundary performs no source-file discovery or VS Code access.
  artifact <manifest.json>  Inspect or explicitly acquire one Cognitive Artifact Manifest v0.
      --provider <id@version> exact provider compatibility identity (required)
      --cache <dir>           content-addressed MMI artifact cache root (default: OS user cache)
      --download              explicitly allow HTTPS acquisition after showing manifest metadata
      --offline               forbid HTTPS access; use verified cache/local/runtime-managed sources only
                            Runtime-managed Ollama/LM Studio models are discovered only for this explicit command.
  match-ids <selection.json> Compare caller-selected literal string IDs across sources.
                            Requires --json and --include-values; digest pins are mandatory.
                            Exit 1 means gaps, duplicate definitions or missing definitions.
  delivery-audit <doc.md> <directory>
                            Compare whole-file Excel references with the source inventory.
                            Requires --root and --json. Read-only: --out is not supported.
                            Exit 0: observed sets aligned; 1: differences/indeterminate; 2: invalid input.
                            This never asserts contractual delivery completeness.
  inventory <directory>    Identify a source collection without exposing document contents.
      --inspect              also run existing inspect; output only Candidate counts and diagnostic codes
      --exclude <path>       exclude a directory-relative path/prefix (repeatable; no glob)
      --max-bytes <n>        per-file read limit (default 16777216; maximum 268435456)
                            --json emits Source Identity v1, collection digest and explicit coverage gaps.
                            Exit 1 means partial coverage; output must stay outside the scanned directory.
  inspect <source>          List workbook/CSV regions, structured Trees, static HTML DOM fragments,
                            or Word (.docx) headings, tables, pictures and comments.
                            --json adds Semantic Candidates with status, method, provenance and fingerprint
      --cells                 bounded physical-cell observation; requires --sheet, --range and --json
      --include-values        with --cells, explicitly include raw/display values and saved formula text
      --header-range <A1:B2>  caller-selected header inside --range; no semantic inference
      --max-cells <n>         --cells output limit (default/maximum 4096)
      --expected-source-digest <sha256:...>  refuse when the source digest differs (inspect, inspect --cells, select)
      --values <n>            also print the first n body rows of each region
      --from <doc.md>         write suggested references relative to this document
      --import-assist          also show grid-layout import roles, revalidated reference proposals and cautions
      --ledger <file>         import ledger (default: <root>/mmi-ledger.json when ledger filtering is used)
      --similarity-evidence <file>
                              optional research similarity sidecar; display only, never import identity
      --tree-method <list>    flat-text only: comma-separated indent,heading-number,prefix-code
                              (default: all three methods, kept as separate hypotheses)
      --tree-parent-columns <list>
                              workbook/CSV only: exact header names ID,Parent[,Label]
      --tree-level-columns <list>
                              workbook/CSV only: exact header names Level,Label
      --unimported            show only occurrences never imported (duplicates remain separate)
      --exclude-imported      hide exact imported occurrences; keep changed/stale/duplicate/unimported
                            For .xlsx/.xlsm it also lists embedded pictures, explicit Data Validation choice lists,
                            and classic cell Notes. Note bodies are omitted from text output; --json retains source claims.
                            For .json and safe-subset .yaml/.yml it lists object/array nodes by RFC 6901 JSON Pointer.
                            YAML anchors/aliases/merge keys/explicit tags/non-string keys are rejected.
                            Generic .xml lists explicit element nodes; XML Spreadsheet 2003 remains a table source.
                            .txt/.text/.log use deterministic M1 hierarchy hypotheses; conflicting methods are not merged.
                            .html/.htm list explicit main/section/table/figure Candidate fragments (no scripts/URLs fetched).
                            .docx lists explicit heading styles, tables, embedded pictures and comments (read-only).
  html-audit <source.html>   Read-only post-commit integrity audit (no repairs or file writes)
      --plan <file.json>      reuse approved html-commit manifest with sourceDigest and fragments
      --root <workspace>      source, plan, ledger and outputs must stay inside workspace
      --ledger <file>         default <root>/mmi-ledger.json
      --json                  show complete / incomplete / stale / blocked and per-file details
                            Exit 0 only for complete mechanical consistency; exit 1 otherwise.
  html-commit <source.html>  Explicitly save reviewed static HTML fragments as a batch
      --plan <file.json>      requires sourceDigest and reviewed fragments (id, expectedFingerprint, output)
      --commit               required for filesystem changes; no implied write from preview
      --root <workspace>      source, plan, ledger and outputs must stay inside workspace
      --ledger <file>         default <root>/mmi-ledger.json
      --json                  report output hashes and ledger location
                            This is not crash-atomic, safe HTML publishing or Detached.
  html-plan <source.html>   Analyze reviewed fragment locations and cross-file links without writes
      --preview               include normalized, in-memory HTML for reviewed fragments (requires --json)
      --plan <file.json>      workspace-local plan: {"fragments":[{"id":"...","expectedFingerprint":"sha256:...","output":"docs/page.html"}]}
      --root <workspace>      source and plan file must be inside workspace
      --json                  print full link proposals and unresolved dependency diagnostics
                            Exit 1 if the plan contains identified blockers.
  extract <source>          Extract one reviewed Candidate as a standard asset without modifying the source
      --image <n|all>         workbook picture number shown by inspect, or all
      --table <range>         exact detected table Candidate range (requires --sheet)
      --tree <path|root>      exact JSON/YAML/XML/flat-text/tabular Tree Candidate structural path shown by inspect;
                              root means the JSON/YAML/XML document root
      --tree-parent-columns <list>
                              tabular Tree: exact header names ID,Parent[,Label]
      --tree-level-columns <list>
                              tabular Tree: exact header names Level,Label
      --sheet <name>          sheet for --table or tabular --tree
      --html-id <id>           static HTML5 fragment with this unique DOM ID
      --docx-table <n>         Word table number shown by inspect
      --docx-image <n>         Word picture number shown by inspect
      --expected-fingerprint <sha256:...>
                               required review-time fingerprint from inspect --json
                            Exactly one of --image, --table, --tree, --html-id, --docx-table or --docx-image is required
      --out-dir <dir>         assets folder (default: assets); files are content-addressed
      --from <doc.md>         provenance/source labels are relative to this document
      --ledger <file>         import ledger (default: <root>/mmi-ledger.json)
                            HTML output is normalized .html, not Markdown or a safe publication.
                            HTML output dir default: <root>/assets/html. Local unresolved links
                            and active content fail closed. --root is the workspace boundary.
                            Word output is a GFM table asset or a content-addressed picture asset;
                            the .docx source is never modified.
  snapshot <workbook>       Render one sheet range as a deterministic visual snapshot
      --renderer <name>       libreoffice (PNG, default) or native-svg (dependency-free SVG)
      --sheet <name>          worksheet to render with --range
      --range <A1:B9>         physical cell range to render with --sheet
      --hint <n>              use a ready drawing snapshot hint shown by inspect
                            Use either --hint or the --sheet + --range pair
      --dpi <72..600>         raster resolution (default: 150)
      --out-dir <dir>         snapshot assets folder (default: <root>/assets/snapshots)
      --from <doc.md>         write the Markdown image reference relative to this document
      --ledger <file>         import ledger (default: <root>/mmi-ledger.json)
      -o <file.svg>          direct SVG export; --sheet required, --range optional (whole sheet)
                            does not write a ledger; cannot combine with renderer/hint/asset options
  import <workbook>         Create a modernization draft: tables stay live references, images become assets
      --draft <file.md>       new Markdown draft to create (required; existing files are not overwritten)
      --copy-source <file>    copy a source outside --root into this workspace file before importing
      --out-dir <dir>         optional image asset folder (default: <draft>/assets/<workbook>/)
      --ledger <file>         import ledger (default: <root>/mmi-ledger.json)
  select <workbook>         Print the reference for a table chosen by name, columns/rows by heading
      --table <name|range>    Excel table, name, title or A1 range
      --candidate <sha256:...>  table Candidate fingerprint from inspect --json (instead of --table)
      --sheet <name>  --columns <h1,h2>  --contains <text> [--in <heading>]  --first <n>
      --from <doc.md>         write the reference relative to this document
      --expected-source-digest <sha256:...>  refuse when the workbook digest differs from inspect's sourceDigest
  find <description...>     Search workbooks under --root for tables matching a description
  check <path...>           Validate MMI references in Markdown files or directories
                            (exit code 1 when any error is found)
  render <doc.md>           Expand references into Markdown tables (default) or HTML
      --to md|html
      --css <file>            html: add a style sheet after the defaults (repeatable; inside --root, no @import or external url())
                            html: YAML front matter adds cover, approvals, TOC, header/footer (reference.md)
  materialize <doc.md>      Write a source-independent Markdown projection for detaching
      -o, --out <file>        detached Markdown output (required; must differ from source)
      --attachments-dir <dir> directory for card-sized table attachments
      --assets-dir <dir>      directory for copied local image assets
      --ledger <file>          verify adopted extracted Candidates against this ledger
  detach-check <doc.md>     Verify a Markdown artifact has no MMI refs, unresolved cards,
                            broken local links or links outside --root
  manifest <doc.md>         List references that fall back to 別紙 cards as CSV
  provenance <doc.md>       Report Linked references, adopted Extracted assets and diagnostics for one document
      --ledger <file>         import ledger (default: <root>/mmi-ledger.json)
      --review-basis <file>   review-basis sidecar (default: <root>/mmi-review-basis.json)
      --fail-on <list>        opt-in CI gate: diagnostics,stale,review-stale,missing
                            Default exit code is 0 because this command is a report.
                            Read-only and content-light: source cell values are not included.
                            Review state is not-configured until 'review-basis --write' is used.
  review-basis <doc.md>     Preview or explicitly record the reviewed logical-table digest of each Linked reference
      --write                 write the review-basis sidecar (without it, nothing is written)
      --review-basis <file>   sidecar path (default: <root>/mmi-review-basis.json)
                            Recording is never automatic. A failed logical-table read leaves the file unchanged.
  impact <source>           Find Markdown dependencies on one source across --root.
                            Reports live MMI refs, adopted Extracted provenance and local links.
                            The source may already be missing; this command never rewrites references.
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
  -h, --help
  -v, --version            print the installed MMI package version
                            with --json: mmi.build-identity/v1 (commit, lockfile digest, Node.js, distribution)`;

export function readCliVersion(): string {
  const candidates = [
    new URL('../../package.json', import.meta.url),
    new URL('../../../package.json', import.meta.url),
  ];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
        version?: unknown;
      };
      if (
        typeof parsed.version === 'string'
        && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(parsed.version)
      ) {
        return parsed.version;
      }
    } catch {
      // Try the source/compiled alternative location.
    }
  }
  throw new Error('MMI package version metadata was not found.');
}

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: 'string' },
      cells: { type: 'boolean', default: false },
      'header-range': { type: 'string' },
      'max-cells': { type: 'string' },
      'expected-source-digest': { type: 'string' },
      inspect: { type: 'boolean', default: false },
      exclude: { type: 'string', multiple: true },
      'max-bytes': { type: 'string' },
      json: { type: 'boolean', default: false },
      out: { type: 'string', short: 'o' },
      to: { type: 'string', default: 'md' },
      css: { type: 'string', multiple: true },
      values: { type: 'string', default: '0' },
      from: { type: 'string' },
      image: { type: 'string' },
      tree: { type: 'string' },
      'html-id': { type: 'string' },
      'docx-table': { type: 'string' },
      'docx-image': { type: 'string' },
      plan: { type: 'string' },
      commit: { type: 'boolean', default: false },
      preview: { type: 'boolean', default: false },
      'expected-fingerprint': { type: 'string' },
      'tree-method': { type: 'string' },
      range: { type: 'string' },
      hint: { type: 'string' },
      dpi: { type: 'string' },
      renderer: { type: 'string' },
      'tree-parent-columns': { type: 'string' },
      'tree-level-columns': { type: 'string' },
      'out-dir': { type: 'string' },
      draft: { type: 'string' },
      'copy-source': { type: 'string' },
      'attachments-dir': { type: 'string' },
      'assets-dir': { type: 'string' },
      ledger: { type: 'string' },
      'review-basis': { type: 'string' },
      'fail-on': { type: 'string' },
      write: { type: 'boolean', default: false },
      'similarity-evidence': { type: 'string' },
      unimported: { type: 'boolean', default: false },
      'exclude-imported': { type: 'boolean', default: false },
      'import-assist': { type: 'boolean', default: false },
      table: { type: 'string' },
      candidate: { type: 'string' },
      sheet: { type: 'string' },
      columns: { type: 'string' },
      contains: { type: 'string' },
      in: { type: 'string' },
      first: { type: 'string' },
      task: { type: 'string' },
      package: { type: 'string' },
      document: { type: 'string' },
      provider: { type: 'string' },
      cache: { type: 'string' },
      download: { type: 'boolean', default: false },
      offline: { type: 'boolean', default: false },
      'include-values': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.version) {
    console.log(
      values.json
        ? JSON.stringify(readBuildIdentity(readCliVersion()))
        : readCliVersion(),
    );
    return 0;
  }
  if (values.help || !command) {
    console.log(USAGE);
    return command || values.help ? 0 : 2;
  }
  if (values.commit && command !== 'html-commit') {
    return usageError('--commit is supported only by html-commit');
  }
  if (values.preview && command !== 'html-plan') {
    return usageError('--preview is supported only by html-plan --json');
  }
  if ((values.cells || values['header-range'] || values['max-cells'] || values['expected-source-digest']) && command !== 'inspect' && command !== 'select') {
    return usageError('--cells and its range options apply only to inspect');
  }
  if ((values.cells || values['header-range'] || values['max-cells']) && command !== 'inspect') {
    return usageError('--cells and its range options apply only to inspect');
  }
  const root = path.resolve(values.root ?? process.cwd());
  const emit = (text: string) => (values.out ? fs.writeFileSync(values.out, text) : process.stdout.write(text.endsWith('\n') ? text : `${text}\n`));

  switch (command) {
    case 'schema': {
      if (args.length !== 1) {
        return usageError(
          'schema needs one of: candidate, ledger, review-decisions, provenance-report, review-basis, cognitive-artifact',
        );
      }
      const schemas: Record<string, () => Record<string, unknown>> = {
        candidate: semanticCandidateSchemaJson,
        ledger: importLedgerSchemaJson,
        'review-decisions': reviewDecisionsSchemaJson,
        'provenance-report': provenanceReportSchemaJson,
        'review-basis': reviewBasisSchemaJson,
        'cognitive-artifact': cognitiveArtifactManifestSchemaJson,
      };
      const schema = schemas[args[0]];
      if (!schema) {
        return usageError(
          'schema needs one of: candidate, ledger, review-decisions, provenance-report, review-basis, cognitive-artifact',
        );
      }
      emit(JSON.stringify(schema(), null, 2));
      return 0;
    }
    case 'core': {
      if (args.length !== 1) {
        return usageError('core takes one request JSON file or - for stdin');
      }
      const requestText = args[0] === '-'
        ? fs.readFileSync(0, 'utf8')
        : fs.readFileSync(path.resolve(args[0]), 'utf8');
      let request: unknown;
      try {
        request = JSON.parse(requestText);
      } catch (error) {
        return usageError(
          `core request is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const response = runPortableCoreRequest(request);
      emit(JSON.stringify(response, null, 2));
      return 0;
    }
    case 'artifact': {
      if (args.length !== 1) {
        return usageError('artifact takes one Cognitive Artifact Manifest JSON file');
      }
      if (!values.provider) {
        return usageError('artifact needs --provider <id@version>');
      }
      if (values.download && values.offline) {
        return usageError('artifact accepts only one of --download or --offline');
      }

      const provider = parseArtifactProvider(values.provider);
      if (!provider) {
        return usageError('artifact --provider must be <non-empty-id>@<non-empty-version>');
      }

      const manifestPath = path.resolve(args[0]);
      let manifest: CognitiveArtifactManifestV0;
      try {
        manifest = parseCognitiveArtifactManifest(
          fs.readFileSync(manifestPath, 'utf8'),
        );
      } catch (error) {
        console.error(
          `mmi: artifact manifest: ${cliErrorText(error)}`,
        );
        return 1;
      }

      let runtimeArtifacts: RuntimeManagedArtifact[] = [];
      if (manifest.sources.some((source) => source.kind === 'runtime-managed')) {
        const discovered = await discoverLocalEmbeddingModels();
        runtimeArtifacts = discovered.map(runtimeManagedArtifactFromEmbeddingModel);
      }

      let resolution: CognitiveArtifactResolution;
      try {
        resolution = await resolveCognitiveArtifact(manifest, {
          provider,
          ...(values.cache ? { cacheRoot: path.resolve(values.cache) } : {}),
          localRoot: path.dirname(manifestPath),
          runtimeArtifacts,
          allowDownload: values.download,
          offline: values.offline,
        });
      } catch (error) {
        console.error(
          `mmi: artifact: ${cliErrorText(error)}`,
        );
        return 1;
      }

      const result = {
        manifest: {
          schema: manifest.schema,
          schemaVersion: manifest.schemaVersion,
          artifactId: manifest.artifactId,
          kind: manifest.kind,
          version: manifest.version,
          sha256: manifest.sha256,
          sizeBytes: manifest.sizeBytes,
          license: manifest.license,
          compatibleProviders: manifest.compatibleProviders,
          sources: manifest.sources,
        },
        provider,
        resolution,
      };
      emit(values.json
        ? JSON.stringify(result, null, 2)
        : formatCognitiveArtifactResult(result));
      return resolution.status === 'unavailable' ? 1 : 0;
    }
    case 'html-audit': {
      if (args.length !== 1 || !values.plan) {
        return usageError('html-audit needs one source.html and --plan <file.json>');
      }
      if (values.out || values.write || values.preview || values.commit) {
        return usageError('html-audit is read-only: --out, --write, --preview and --commit are not supported');
      }
      const sourcePath = path.resolve(args[0]);
      const planPath = path.resolve(values.plan);
      const ledgerPath = path.resolve(root, values.ledger ?? DEFAULT_LEDGER_FILE);
      try {
        const rootReal = fs.realpathSync(root);
        for (const input of [sourcePath, planPath]) {
          if (!isPathWithinBoundary(input, root)
              || !isPathWithinBoundary(fs.realpathSync(input), rootReal)) {
            throw new Error('MMI_HTML_OUTSIDE_ROOT: source and plan must stay in workspace');
          }
        }
        const manifest = JSON.parse(fs.readFileSync(planPath, 'utf8')) as {
          sourceDigest?: unknown;
          fragments?: unknown;
        };
        if (!manifest || typeof manifest !== 'object'
            || typeof manifest.sourceDigest !== 'string'
            || !/^sha256:[0-9a-f]{64}$/u.test(manifest.sourceDigest)
            || !Array.isArray(manifest.fragments)
            || manifest.fragments.some((item: unknown) =>
              !item || typeof item !== 'object'
              || typeof (item as HtmlPlanSelection).id !== 'string'
              || typeof (item as HtmlPlanSelection).output !== 'string'
              || typeof (item as HtmlPlanSelection).expectedFingerprint !== 'string')) {
          throw new Error('MMI_HTML_AUDIT_INVALID: require reviewed sourceDigest and fragments');
        }
        const report = auditHtmlDecomposition({
          workspaceRoot: root,
          sourcePath,
          ledgerPath,
          selections: manifest.fragments as HtmlPlanSelection[],
          expectedSourceDigest: manifest.sourceDigest,
        });
        if (values.json) {
          emit(JSON.stringify(report, null, 2));
        } else {
          emit([
            `status: ${report.status}`,
            `source digest: ${report.sourceDigest}`,
            ...report.files.map((file) =>
              `  ${file.output}: output=${file.file} ledger=${file.ledger}`),
            ...report.problems.map((problem) => `  problem: ${problem}`),
            'complete means mechanically consistent at observation time, not approved for publication.',
          ].join('\n'));
        }
        return report.status === 'complete' ? 0 : 1;
      } catch (error) {
        console.error(`mmi: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
      }
    }
    case 'html-commit': {
      if (!values.commit) {
        return usageError('html-commit requires explicit --commit');
      }
      if (args.length !== 1 || !values.plan) {
        return usageError('html-commit needs one source.html and --plan <file.json>');
      }
      if (values.out) {
        return usageError('html-commit does not support --out for its JSON report');
      }
      const sourcePath = path.resolve(args[0]);
      const planPath = path.resolve(values.plan);
      const ledgerPath = path.resolve(root, values.ledger ?? DEFAULT_LEDGER_FILE);
      try {
        const rootReal = fs.realpathSync(root);
        for (const input of [sourcePath, planPath]) {
          if (!isPathWithinBoundary(input, root)
              || !isPathWithinBoundary(fs.realpathSync(input), rootReal)) {
            throw new Error('MMI_HTML_OUTSIDE_ROOT: source/plan must stay in workspace');
          }
        }
        const manifest = JSON.parse(fs.readFileSync(planPath, 'utf8')) as {
          sourceDigest?: unknown;
          fragments?: unknown;
        };
        if (!manifest || typeof manifest !== 'object'
            || typeof manifest.sourceDigest !== 'string'
            || !/^sha256:[0-9a-f]{64}$/u.test(manifest.sourceDigest)
            || !Array.isArray(manifest.fragments)
            || manifest.fragments.some((item: unknown) =>
              !item || typeof item !== 'object'
              || typeof (item as HtmlPlanSelection).id !== 'string'
              || typeof (item as HtmlPlanSelection).output !== 'string'
              || typeof (item as HtmlPlanSelection).expectedFingerprint !== 'string')) {
          throw new Error('MMI_HTML_COMMIT_INVALID: require sourceDigest and reviewed fragments');
        }
        const result = commitHtmlDecomposition({
          workspaceRoot: root,
          sourcePath,
          ledgerPath,
          selections: manifest.fragments as HtmlPlanSelection[],
          expectedSourceDigest: manifest.sourceDigest,
        });
        emit(values.json ? JSON.stringify(result, null, 2)
          : result.files.map((item) => `${item.output}: ${item.status} (${item.digest})`).join('\n'));
        return 0;
      } catch (error) {
        console.error(`mmi: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
      }
    }
    case 'html-plan': {
      if (values.preview && !values.json) {
        return usageError('html-plan --preview requires --json; preview never writes files');
      }
      if (args.length !== 1 || !values.plan) {
        return usageError('html-plan needs one source.html and --plan <file.json>');
      }
      if (values.out) {
        return usageError('html-plan is read-only; --out is not supported');
      }
      const absoluteSource = path.resolve(args[0]);
      const absolutePlan = path.resolve(values.plan);
      try {
        const workspaceReal = fs.realpathSync(root);
        for (const input of [absoluteSource, absolutePlan]) {
          if (!isPathWithinBoundary(input, root)
              || !isPathWithinBoundary(fs.realpathSync(input), workspaceReal)) {
            throw new Error('MMI_HTML_OUTSIDE_ROOT: source and plan must stay in workspace');
          }
        }
        if (!/\.html?$/iu.test(absoluteSource)) {
          return usageError('html-plan source must end with .html or .htm');
        }
        const documentBytes = fs.readFileSync(absoluteSource);
        const htmlText = new TextDecoder('utf-8', {
          fatal: true, ignoreBOM: true,
        }).decode(documentBytes);
        const doc = readHtmlFragments(
          htmlText,
          path.relative(root, absoluteSource).split(path.sep).join('/'),
          createSourceIdentityFromBytes(documentBytes).digest,
        );
        const manifest = JSON.parse(fs.readFileSync(absolutePlan, 'utf8')) as {
          fragments?: unknown;
        };
        if (!manifest || typeof manifest !== 'object'
            || !Array.isArray(manifest.fragments)
            || manifest.fragments.some((item: unknown) =>
              !item || typeof item !== 'object'
              || typeof (item as HtmlPlanSelection).id !== 'string'
              || typeof (item as HtmlPlanSelection).output !== 'string'
              || typeof (item as HtmlPlanSelection).expectedFingerprint !== 'string')) {
          throw new Error('MMI_HTML_PLAN_INVALID: expected fragments with id, output, expectedFingerprint');
        }
        const result = planHtmlDecomposition(
          doc,
          manifest.fragments as HtmlPlanSelection[],
        );
        if (values.json) emit(JSON.stringify(
          values.preview
            ? previewHtmlDecomposition(doc, manifest.fragments as HtmlPlanSelection[])
            : result,
          null, 2,
        ));
        else {
          emit([
            `source: ${result.source}`,
            `selected fragments: ${result.fragments.length}`,
            `cross-file links: ${result.anchors.filter((anchor) => anchor.status === 'cross-output').length}`,
            `identified blockers: ${result.problems.length}`,
            ...result.anchors.filter((anchor) => anchor.status === 'cross-output')
              .map((anchor) => `  ${anchor.sourceId}: ${anchor.href} -> ${anchor.proposedHref}`),
            ...result.problems.map((problem) => `  ${problem.sourceId}: ${problem.code}: ${problem.detail}`),
          ].join('\n'));
        }
        return result.hasIdentifiedBlockers ? 1 : 0;
      } catch (error) {
        console.error(`mmi: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
      }
    }
    case 'match-ids': {
      if (args.length !== 1 || !values.json || !values['include-values']) return usageError('match-ids requires one selection file, --json and --include-values (ID tokens will be disclosed)');
      const allowed = new Set(['root', 'json', 'include-values', 'out']);
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined || value === false || (key === 'to' && value === 'md') || (key === 'values' && value === '0')) continue;
        if (!allowed.has(key)) return usageError(`match-ids does not accept --${key}`);
      }
      if (values.out && (!pathWithinBoundaryForWrite(path.resolve(values.out), root) || fs.existsSync(values.out))) return usageError('match-ids output must be a new file inside --root');
      const selectionPath = resolveSourcePath({ markdownFilePath: path.join(root, '__mmi_ids__.md'), sourcePath: path.resolve(args[0]), workspaceRoot: root });
      const input: unknown = JSON.parse(readBoundedSourceBytes(selectionPath, 65536).toString('utf8'));
      const report = matchSourceIds(input, root);
      const text = `${JSON.stringify(report, null, 2)}\n`;
      if (values.out) fs.writeFileSync(values.out, text, { flag: 'wx' });
      else process.stdout.write(text);
      return report.status === 'observed' ? 0 : 1;
    }
    case 'delivery-audit': {
      if (args.length !== 2) return usageError('delivery-audit takes a Markdown file and inventory directory');
      if (!values.root || !values.json || values.out || values.inspect || values.exclude?.length) {
        return usageError('delivery-audit requires --root and --json; --out, --inspect and --exclude are not supported');
      }
      const report = auditDeliveryReferences({
        markdownFilePath: path.resolve(args[0]),
        inventoryDirectory: path.resolve(args[1]),
        workspaceRoot: root,
        ...(values['max-bytes'] === undefined ? {} : { maxBytes: Number(values['max-bytes']) }),
      });
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.comparison.alignment === 'aligned' ? 0 : 1;
    }
    case 'inventory': {
      if (args.length !== 1) return usageError('inventory takes one directory');
      const directory = path.resolve(args[0]);
      if (values.out) {
        const output = path.resolve(values.out);
        if (fs.existsSync(output)) return usageError('inventory output already exists; choose a new output file');
        if (isPathWithinBoundary(output, directory)
            || isPathWithinBoundary(fs.realpathSync(path.dirname(output)), fs.realpathSync(directory))) {
          return usageError('inventory output must stay outside the scanned directory');
        }
      }
      const report = inventoryDesignSources({
        workspaceRoot: root, directory, exclude: values.exclude,
        ...(values['max-bytes'] === undefined ? {} : { maxBytes: Number(values['max-bytes']) }),
        ...(values.inspect ? { inspect: (file: string) => {
          const result = inspectSource(file, 0);
          const candidateCounts: Record<string, number> = {};
          for (const candidate of result.candidates) candidateCounts[candidate.kind] = (candidateCounts[candidate.kind] ?? 0) + 1;
          const diagnosticCodes = [...new Set(Object.entries(result)
            .filter(([key, items]) => key.endsWith('Diagnostics') && Array.isArray(items))
            .flatMap(([, items]) => (items as { code: string }[]).map((item) => item.code)))].sort();
          return { candidateCounts, diagnosticCodes };
        } } : {}),
      });
      const text = values.json ? JSON.stringify(report, null, 2) : [
        `inventory: ${report.status} (${report.consistency})`, report.collectionDigest,
        ...report.entries.map((entry) => `${entry.state}\t${entry.path}${entry.reason ? `\t${entry.reason}` : ''}`),
      ].join('\n');
      if (values.out) fs.writeFileSync(values.out, `${text}\n`, { flag: 'wx' });
      else emit(text);
      return report.status === 'complete' ? 0 : 1;
    }
    case 'inspect': {
      if (args.length !== 1) return usageError('inspect takes one source file');
      if (values.unimported && values['exclude-imported']) {
        return usageError('inspect accepts only one of --unimported or --exclude-imported');
      }
      if (values.cells) {
        if (!values.sheet || !values.range || !values.json) return usageError('--cells requires --sheet, --range and --json');
        if (values.values !== '0' || values['import-assist'] || values.ledger || values.unimported || values['exclude-imported'] || values['similarity-evidence']) {
          return usageError('--cells cannot be combined with row samples, import assistance or ledger options');
        }
        const sourcePath = resolveSourcePath({ markdownFilePath: path.join(root, '__mmi_cells__.md'), sourcePath: path.resolve(args[0]), workspaceRoot: root });
        if (values.out && (!pathWithinBoundaryForWrite(path.resolve(values.out), root) || fs.existsSync(values.out))) {
          return usageError('--cells output must be a new file inside --root');
        }
        const report = observeSourceCells({
          source: path.relative(root, sourcePath).split(path.sep).join('/'),
          bytes: readBoundedSourceBytes(sourcePath, 16 * 1024 * 1024),
          sheet: values.sheet, range: values.range,
          headerRange: values['header-range'], includeValues: values['include-values'],
          expectedSourceDigest: values['expected-source-digest'],
          ...(values['max-cells'] === undefined ? {} : { maxCells: Number(values['max-cells']) }),
        });
        const text = `${JSON.stringify(report, null, 2)}\n`;
        if (values.out) fs.writeFileSync(values.out, text, { flag: 'wx' });
        else process.stdout.write(text);
        return 0;
      }
      if (values['header-range'] || values['max-cells']) return usageError('cell range options require --cells');
      const absoluteSource = path.resolve(args[0]);
      if (values['expected-source-digest'] !== undefined) {
        try {
          const check = checkExpectedSourceDigest(absoluteSource, values['expected-source-digest']);
          if (!check.ok) {
            console.error(`mmi: ${check.message}`);
            return 1;
          }
        } catch (error) {
          return usageError(error instanceof Error ? error.message : String(error));
        }
      }
      if (
        values['tree-method']
        && !/\.(txt|text|log)$/iu.test(absoluteSource)
      ) {
        return usageError(
          '--tree-method applies only to .txt, .text or .log sources',
        );
      }
      if (
        (values['tree-parent-columns'] || values['tree-level-columns'])
        && !/\.(xlsx|xlsm|xls|csv)$/iu.test(absoluteSource)
      ) {
        return usageError(
          '--tree-parent-columns/--tree-level-columns apply only to workbook or CSV sources',
        );
      }
      let flatTextMethods: readonly FlatTextTreeMethod[] | undefined;
      let tabularHierarchy: TabularHierarchyConfig | undefined;
      try {
        flatTextMethods = values['tree-method']
          ? parseFlatTextTreeMethods(values['tree-method'])
          : undefined;
        tabularHierarchy = parseTabularHierarchyConfig(
          values['tree-parent-columns'],
          values['tree-level-columns'],
        );
      } catch (error) {
        return usageError(
          error instanceof Error ? error.message : String(error),
        );
      }
      const raw = inspectSource(
        absoluteSource,
        Number(values.values) || 0,
        values.from,
        flatTextMethods,
        tabularHierarchy,
      );
      if (values['import-assist']) {
        if (raw.trees !== undefined || raw.htmlFragments !== undefined) {
          return usageError(
            'inspect --import-assist applies only to workbook/grid sources, not Tree or HTML sources',
          );
        }
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
      const selectors = [
        values.image !== undefined,
        values.table !== undefined,
        values.tree !== undefined,
        values['html-id'] !== undefined,
        values['docx-table'] !== undefined,
        values['docx-image'] !== undefined,
      ].filter(Boolean).length;
      if (selectors !== 1) {
        return usageError(
          'extract needs exactly one of --image, --table, --tree, --html-id, --docx-table or --docx-image',
        );
      }
      const sourcePath = path.resolve(args[0]);
      const outDir = path.resolve(values['out-dir'] ?? 'assets');
      const ledgerPath = path.resolve(root, values.ledger ?? DEFAULT_LEDGER_FILE);
      const hasTabularTreeColumns = Boolean(
        values['tree-parent-columns']
        || values['tree-level-columns'],
      );
      if (hasTabularTreeColumns && values.tree === undefined) {
        return usageError(
          '--tree-parent-columns/--tree-level-columns require extract --tree',
        );
      }

      if (values['docx-table'] !== undefined || values['docx-image'] !== undefined) {
        if (!/\.docx$/iu.test(sourcePath)) {
          return usageError('extract --docx-table/--docx-image requires a .docx source');
        }
        if (!values['expected-fingerprint']) {
          return usageError(
            'extract --docx-table/--docx-image requires --expected-fingerprint from inspect --json',
          );
        }
        if (values.out) {
          return usageError('extract --docx-table/--docx-image does not support --out; use --out-dir');
        }
        if (values.sheet || values.tree || values.image || values['html-id']
            || values['tree-parent-columns'] || values['tree-level-columns']) {
          return usageError('extract --docx-table/--docx-image cannot use workbook/HTML/Tree selectors');
        }
        const ordinal = Number(
          values['docx-table'] ?? values['docx-image'],
        );
        if (!Number.isInteger(ordinal) || ordinal < 1) {
          return usageError('--docx-table/--docx-image needs a 1-based number shown by inspect');
        }
        const docxOptions = {
          sourcePath,
          ordinal,
          expectedFingerprint: values['expected-fingerprint'],
          workspaceRoot: root,
          outDir: path.resolve(root, values['out-dir'] ?? 'assets/docx'),
          ledgerPath,
          ...(values.from ? { fromDocument: values.from } : {}),
        };
        const extracted = values['docx-table'] !== undefined
          ? extractDocxTable(docxOptions)
          : extractDocxImage(docxOptions);
        for (const problem of extracted.problems) {
          console.error(`mmi: ${problem.code}: ${problem.message}`);
        }
        if (values.json) {
          emit(JSON.stringify(extracted, null, 2));
        } else if (extracted.extracted) {
          emit(extracted.extracted.markdown);
        }
        return extracted.problems.length > 0 ? 1 : 0;
      }

      if (values['html-id'] !== undefined) {
        if (!/\.html?$/iu.test(sourcePath)) {
          return usageError('extract --html-id requires a .html or .htm source');
        }
        if (!values['expected-fingerprint']) {
          return usageError('extract --html-id requires --expected-fingerprint from inspect --json');
        }
        if (values.out) {
          return usageError('extract --html-id does not support --out; use --out-dir');
        }
        if (values.sheet || values['tree-parent-columns'] || values['tree-level-columns']) {
          return usageError('extract --html-id cannot use workbook/Tree selectors');
        }
        try {
          const extracted = extractHtmlFragment({
            sourcePath,
            id: values['html-id'],
            expectedFingerprint: values['expected-fingerprint'],
            workspaceRoot: root,
            outDir: path.resolve(root, values['out-dir'] ?? 'assets/html'),
            ledgerPath,
          });
          if (values.json) emit(JSON.stringify(extracted, null, 2));
          else emit(`HTML fragment: ${extracted.path} (${extracted.status})`);
          return 0;
        } catch (error) {
          console.error(`mmi: ${error instanceof Error ? error.message : String(error)}`);
          return 1;
        }
      }

      if (values.tree !== undefined) {
        const pointer = values.tree === 'root' ? '' : values.tree;
        let tabularHierarchy: TabularHierarchyConfig | undefined;
        try {
          tabularHierarchy = parseTabularHierarchyConfig(
            values['tree-parent-columns'],
            values['tree-level-columns'],
          );
        } catch (error) {
          return usageError(
            error instanceof Error ? error.message : String(error),
          );
        }

        const tabularSource = /\.(xlsx|xlsm|xls|csv)$/iu.test(sourcePath);
        if (tabularSource && !tabularHierarchy) {
          return usageError(
            'extract --tree on workbook/CSV needs --tree-parent-columns or --tree-level-columns',
          );
        }
        if (tabularHierarchy && !tabularSource) {
          return usageError(
            '--tree-parent-columns/--tree-level-columns apply only to workbook or CSV sources',
          );
        }
        if (tabularHierarchy && !values.sheet) {
          return usageError(
            'extract --tree with tabular hierarchy columns needs --sheet <name>',
          );
        }

        const result = tabularHierarchy
          ? extractTabularHierarchyTree({
              sourcePath,
              pointer,
              outDir,
              fromDocument: values.from,
              ledgerPath,
              sheet: values.sheet!,
              config: tabularHierarchy,
            })
          : /\.ya?ml$/iu.test(sourcePath)
            ? extractYamlTree({
                sourcePath,
                pointer,
                outDir,
                fromDocument: values.from,
                ledgerPath,
              })
            : /\.xml$/iu.test(sourcePath)
              ? extractXmlTree({
                sourcePath,
                pointer,
                outDir,
                fromDocument: values.from,
                ledgerPath,
              })
              : /\.(txt|text|log)$/iu.test(sourcePath)
                ? extractFlatTextTree({
                  sourcePath,
                  pointer,
                  outDir,
                  fromDocument: values.from,
                  ledgerPath,
                })
                : extractJsonTree({
                    sourcePath,
                  pointer,
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

      if (values.table !== undefined) {
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
    case 'snapshot': {
      if (values.out) {
        if (values.hint || values.renderer || values['out-dir'] || values.dpi || values.ledger) {
          return usageError('snapshot -o cannot be combined with --hint, --renderer, --out-dir, --dpi or --ledger');
        }
        if (!handoffPathWithinRoot(path.resolve(args[0] ?? '.'), root) || !handoffPathWithinRoot(path.resolve(values.out), root)) {
          return usageError('snapshot source and output must stay within --root workspace');
        }
        return runSnapshot(args, values, { out: console.log, err: console.error, cwd: process.cwd() });
      }
      if (args.length !== 1) return usageError('snapshot takes one workbook');
      if (values.hint && (values.sheet || values.range)) {
        return usageError('snapshot uses either --hint or --sheet + --range, not both');
      }
      if (!values.hint && (!values.sheet || !values.range)) {
        return usageError('snapshot needs --hint <n> or --sheet <name> + --range <A1:B9>');
      }

      const sourcePath = path.resolve(args[0]);
      const outDir = values['out-dir']
        ? path.resolve(values['out-dir'])
        : path.join(root, 'assets', 'snapshots');
      const ledgerPath = path.resolve(root, values.ledger ?? DEFAULT_LEDGER_FILE);
      if (!handoffPathWithinRoot(sourcePath, root)) {
        return usageError('snapshot source must stay within --root workspace');
      }
      if (!handoffPathWithinRoot(outDir, root)) {
        return usageError('snapshot --out-dir must stay within --root workspace');
      }
      if (!handoffPathWithinRoot(ledgerPath, root)) {
        return usageError('snapshot ledger must stay within --root workspace');
      }

      let sheet = values.sheet;
      let range = values.range;
      let hintOrdinal: number | undefined;
      if (values.hint) {
        hintOrdinal = Number(values.hint);
        if (!Number.isInteger(hintOrdinal) || hintOrdinal < 1) {
          return usageError('snapshot --hint must be a positive integer');
        }
        const hint = readExcelImages(fs.readFileSync(sourcePath)).snapshotHints
          .find((item) => item.ordinal === hintOrdinal);
        if (!hint) {
          return usageError(`snapshot hint #${hintOrdinal} was not found; run mmi inspect <workbook> first`);
        }
        if (!hint.range) {
          const start = hint.anchor.from
            ? XLSX.utils.encode_cell({ c: hint.anchor.from.col, r: hint.anchor.from.row })
            : undefined;
          return usageError(
            `snapshot hint #${hintOrdinal} (${hint.anchor.kind}${start ? `, starts at ${start}` : ''}) has no safe end cell; choose --sheet ${JSON.stringify(hint.sheet)} --range <A1:B9> manually`,
          );
        }
        sheet = hint.sheet;
        range = hint.range;
      }

      const renderer = values.renderer ?? 'libreoffice';
      if (!['libreoffice', 'native-svg'].includes(renderer)) {
        return usageError('snapshot --renderer must be libreoffice or native-svg');
      }
      if (renderer === 'native-svg' && values.dpi) {
        return usageError('snapshot --dpi applies only to the libreoffice renderer');
      }

      let result:
        | Awaited<ReturnType<typeof renderLibreOfficeRegionSnapshot>>
        | ReturnType<typeof renderNativeSvgRegionSnapshot>;
      try {
        result = renderer === 'native-svg'
          ? renderNativeSvgRegionSnapshot({
              sourcePath,
              sourceLabel: portableDisplayPath(sourcePath),
              sheet: sheet!,
              range: range!,
              outDir,
              ledgerPath,
              ...(values.from ? { fromDocument: path.resolve(values.from) } : {}),
            })
          : await renderLibreOfficeRegionSnapshot({
              sourcePath,
              sourceLabel: portableDisplayPath(sourcePath),
              sheet: sheet!,
              range: range!,
              outDir,
              ledgerPath,
              ...(values.from ? { fromDocument: path.resolve(values.from) } : {}),
              ...(values.dpi ? { dpi: Number(values.dpi) } : {}),
            });
      } catch (error) {
        if (!(error instanceof RegionSnapshotError)) throw error;
        console.error(`mmi: ${error.code}: ${cliErrorText(error)}`);
        return 1;
      }

      const artifactFile = 'pngFile' in result ? result.pngFile : result.svgFile;
      const limitations = 'limitations' in result.manifest
        ? result.manifest.limitations
        : [];
      const summary = {
        status: result.status,
        source: result.manifest.source,
        sheet: result.manifest.selection.sheet,
        range: result.manifest.selection.range,
        artifact: portableDisplayPath(artifactFile),
        ...('pngFile' in result ? { png: portableDisplayPath(result.pngFile) } : {}),
        ...('svgFile' in result ? { svg: portableDisplayPath(result.svgFile) } : {}),
        digest: result.manifest.artifact.digest,
        bytes: result.manifest.artifact.bytes,
        widthPx: result.manifest.artifact.widthPx,
        heightPx: result.manifest.artifact.heightPx,
        manifest: portableDisplayPath(result.manifestFile),
        renderer: result.manifest.renderer,
        ...(limitations.length > 0 ? { limitations } : {}),
        markdown: result.markdown,
        ...(hintOrdinal ? { hint: hintOrdinal } : {}),
      };
      const rendererText = 'libreOfficeVersion' in summary.renderer
        ? summary.renderer.libreOfficeVersion + '; ' + summary.renderer.pdftoppmVersion
        : summary.renderer.id + '; SheetJS ' + summary.renderer.sheetJsVersion;
      emit(values.json
        ? JSON.stringify(summary, null, 2)
        : [
            `snapshot: ${summary.artifact}`,
            `source: ${summary.source.label}#${summary.sheet}|${summary.range}`,
            `digest: ${summary.digest} (${summary.widthPx}x${summary.heightPx}px)`,
            `renderer: ${rendererText}`,
            ...(limitations.length > 0 ? [`limitations: ${limitations.join(', ')}`] : []),
            `manifest: ${summary.manifest}`,
            '',
            summary.markdown,
          ].join('\n'));
      return 0;
    }
    case 'import': {
      if (args.length !== 1) return usageError('import takes one workbook');
      if (!values.draft) return usageError('import needs --draft <file.md>');
      if (values.out) return usageError('import does not use -o/--out; use --draft <file.md>');

      const inputSourcePath = path.resolve(args[0]);
      const draftPath = path.resolve(values.draft);
      const ledgerPath = path.resolve(root, values.ledger ?? DEFAULT_LEDGER_FILE);
      const imageOutDir = values['out-dir'] ? path.resolve(values['out-dir']) : undefined;
      const requestedSourceCopy = values['copy-source']
        ? path.resolve(root, values['copy-source'])
        : undefined;

      if (!handoffPathWithinRoot(path.dirname(draftPath), root)) return usageError('import draft folder must stay within --root workspace');
      if (!handoffPathWithinRoot(ledgerPath, root)) return usageError('import ledger must stay within --root workspace');
      if (imageOutDir && !handoffPathWithinRoot(imageOutDir, root)) return usageError('import --out-dir must stay within --root workspace');
      if (requestedSourceCopy && !handoffPathWithinRoot(requestedSourceCopy, root)) {
        return usageError('import --copy-source must stay within --root workspace');
      }
      if (fs.existsSync(draftPath)) {
        console.error(`mmi: import draft already exists; refusing to overwrite: ${draftPath}`);
        return 1;
      }

      const sourceIsInsideRoot = handoffPathWithinRoot(inputSourcePath, root);
      if (!sourceIsInsideRoot && !requestedSourceCopy) {
        return usageError(
          'import source is outside --root workspace; use --copy-source <workspace-file> to bring it into the project',
        );
      }

      let sourcePath = inputSourcePath;
      let sourceCopyCreated = false;
      let sourceCopied = false;
      if (requestedSourceCopy) {
        try {
          const intake = intakeSourceFile(inputSourcePath, requestedSourceCopy);
          sourcePath = intake.sourcePath;
          sourceCopyCreated = intake.created;
          sourceCopied = sourcePath !== inputSourcePath;
        } catch (error) {
          console.error(
            `mmi: import source intake failed: ${cliErrorText(error)}`,
          );
          return 1;
        }
      }

      let result: ReturnType<typeof writeWorkbookImportDraft>;
      try {
        result = writeWorkbookImportDraft({
          sourcePath,
          draftPath,
          ledgerPath,
          ...(imageOutDir ? { imageOutDir } : {}),
        });
      } catch (error) {
        if (sourceCopyCreated) fs.rmSync(sourcePath, { force: true });
        console.error(
          `mmi: import failed: ${cliErrorText(error)}`,
        );
        return 1;
      }

      const summary = {
        status: (
          result.imageProblems.length > 0
          || result.choiceListProblems.length > 0
        ) ? 'created-with-warnings' : 'created',
        sourceInput: portableDisplayPath(inputSourcePath),
        source: portableDisplayPath(sourcePath),
        sourceCopied,
        draft: portableDisplayPath(draftPath),
        ledger: portableDisplayPath(result.ledgerPath),
        imageOutDir: portableDisplayPath(result.imageOutDir),
        extractedImages: result.extractedImages.length,
        imageProblems: result.imageProblems,
        shapes: result.shapes,
        reviewSkippedShapes: result.reviewSkippedShapes,
        reviewSkippedImages: result.reviewSkippedImages,
        reviewSkippedTables: result.reviewSkippedTables,
        choiceLists: result.choiceLists,
        choiceListProblems: result.choiceListProblems,
        reviewSkippedChoiceLists: result.reviewSkippedChoiceLists,
      };
      const summaryText = values.json
        ? JSON.stringify(summary, null, 2)
        : [
            `status: ${summary.status}`,
            `draft: ${summary.draft}`,
            `images: ${summary.extractedImages}`,
            `ledger: ${summary.ledger}`,
            ...(result.imageProblems.length > 0 ? [`image/drawing warnings: ${result.imageProblems.length}`] : []),
            ...(result.reviewSkippedImages.length > 0 ? [`images skipped by review: ${result.reviewSkippedImages.length}`] : []),
            ...(result.reviewSkippedTables.length > 0 ? [`tables skipped by review: ${result.reviewSkippedTables.length}`] : []),
            ...(result.choiceLists.length > 0 ? [`choice lists: ${result.choiceLists.length}`] : []),
            ...(result.choiceListProblems.length > 0 ? [`choice-list warnings: ${result.choiceListProblems.length}`] : []),
            ...(result.reviewSkippedChoiceLists.length > 0 ? [`choice lists skipped by review: ${result.reviewSkippedChoiceLists.length}`] : []),
          ].join('\n');
      process.stdout.write(summaryText.endsWith('\n') ? summaryText : `${summaryText}\n`);
      for (const problem of result.imageProblems) {
        console.error(`mmi: warning: ${problem.code}${problem.ordinal ? ` (image ${problem.ordinal})` : ''}: ${problem.message}`);
      }
      for (const problem of result.choiceListProblems) {
        console.error(
          `mmi: warning: ${problem.code}${problem.sheet ? ` (${problem.sheet})` : ''}: ${problem.message}`,
        );
      }
      return 0;
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
      if (values.css?.length && values.to !== 'html') return usageError('--css applies to --to html');
      const options = { markdownFilePath: path.resolve(args[0]), workspaceRoot: root, userCss: values.css };
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
    case 'provenance': {
      if (args.length !== 1) return usageError('provenance takes one Markdown file');
      const markdownFilePath = path.resolve(args[0]);
      if (!handoffPathWithinRoot(markdownFilePath, root)) {
        return usageError('provenance document must stay within --root workspace');
      }
      const failOn = new Set(
        (values['fail-on'] ?? '').split(',').map((item) => item.trim()).filter(Boolean),
      );
      const failOnChoices = new Set(['diagnostics', 'stale', 'review-stale', 'missing']);
      for (const choice of failOn) {
        if (!failOnChoices.has(choice)) {
          return usageError(
            `--fail-on accepts diagnostics, stale, review-stale, missing (got ${choice})`,
          );
        }
      }
      let report;
      try {
        const diagnostics = await checkPaths([markdownFilePath], root);
        report = buildProvenanceReport({
          markdownFilePath,
          workspaceRoot: root,
          ledgerPath: path.resolve(root, values.ledger ?? DEFAULT_LEDGER_FILE),
          reviewBasisPath: path.resolve(
            root,
            values['review-basis'] ?? DEFAULT_REVIEW_BASIS_FILE,
          ),
          diagnostics,
        });
      } catch (error) {
        console.error(`mmi: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
      }
      emit(values.json
        ? JSON.stringify(report, null, 2)
        : formatProvenanceReport(report));
      const failed = (failOn.has('diagnostics') && report.summary.diagnostics > 0)
        || (failOn.has('stale') && report.summary.stale > 0)
        || (failOn.has('review-stale') && report.summary.reviewStale > 0)
        || (failOn.has('missing') && report.summary.missingSources > 0);
      return failed ? 1 : 0;
    }
    case 'review-basis': {
      if (args.length !== 1) return usageError('review-basis takes one Markdown file');
      const markdownFilePath = path.resolve(args[0]);
      if (!handoffPathWithinRoot(markdownFilePath, root)) {
        return usageError('review-basis document must stay within --root workspace');
      }
      let result;
      try {
        result = recordReviewBasis({
          markdownFilePath,
          workspaceRoot: root,
          sidecarPath: path.resolve(
            root,
            values['review-basis'] ?? DEFAULT_REVIEW_BASIS_FILE,
          ),
          dryRun: !values.write,
        });
      } catch (error) {
        console.error(`mmi: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
      }
      for (const problem of result.problems) {
        console.error(`mmi: ${problem.code}: ${problem.message}`);
      }
      if (values.json) {
        emit(JSON.stringify(result, null, 2));
      } else {
        const verb = result.written ? 'recorded' : 'would record';
        emit(`${verb} ${result.records.length} reference(s) in ${result.document}`);
        for (const record of result.records) {
          emit(`  ${record.reference}  ${record.logicalTableDigest}`);
        }
        if (!values.write && result.problems.length === 0) {
          emit('(preview only; pass --write to update the review-basis file)');
        }
      }
      return result.problems.length > 0 ? 1 : 0;
    }
    case 'impact': {
      if (args.length !== 1) return usageError('impact takes one source file path');
      const sourcePath = path.resolve(args[0]);
      let result: SourceImpactReport;
      try {
        result = analyzeSourceImpact({
          sourcePath,
          workspaceRoot: root,
        });
      } catch (error) {
        return usageError(
          error instanceof Error ? error.message : String(error),
        );
      }
      emit(values.json
        ? JSON.stringify(result, null, 2)
        : formatSourceImpact(result));
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

function parseArtifactProvider(
  value: string,
): { id: string; version: string } | undefined {
  const separator = value.lastIndexOf('@');
  if (separator <= 0 || separator === value.length - 1) return undefined;
  const id = value.slice(0, separator).trim();
  const version = value.slice(separator + 1).trim();
  return id && version ? { id, version } : undefined;
}

function formatCognitiveArtifactResult(result: {
  manifest: Pick<
    CognitiveArtifactManifestV0,
    | 'artifactId'
    | 'kind'
    | 'version'
    | 'sha256'
    | 'sizeBytes'
    | 'license'
    | 'compatibleProviders'
    | 'sources'
  >;
  provider: { id: string; version: string };
  resolution: CognitiveArtifactResolution;
}): string {
  const sizeMiB = result.manifest.sizeBytes / (1024 * 1024);
  const lines = [
    `artifact: ${result.manifest.artifactId}@${result.manifest.version}`,
    `kind: ${result.manifest.kind}`,
    `identity: ${result.manifest.sha256}`,
    `size: ${result.manifest.sizeBytes} bytes (${sizeMiB.toFixed(2)} MiB)`,
    `license: ${result.manifest.license}`,
    `provider: ${result.provider.id}@${result.provider.version}`,
    `status: ${result.resolution.status}`,
  ];

  if (result.resolution.status === 'available') {
    if (result.resolution.location.kind === 'runtime-managed') {
      lines.push(
        `location: runtime:${result.resolution.location.runtime}/${result.resolution.location.artifactRef}`,
      );
    } else {
      lines.push(`location: ${result.resolution.location.path}`);
    }
    lines.push(`reused: ${result.resolution.reused ? 'yes' : 'no'}`);
  } else if (result.resolution.status === 'download-required') {
    lines.push(`source: ${result.resolution.source.uri}`);
    lines.push(`cache: ${result.resolution.cachePath}`);
    lines.push('download: not started; rerun with --download to acquire explicitly');
  } else {
    lines.push(`reason: ${result.resolution.reason}`);
    if (result.resolution.detail) lines.push(`detail: ${result.resolution.detail}`);
  }

  return lines.join('\n');
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

function formatSourceImpact(report: SourceImpactReport): string {
  const state = report.source.exists ? 'present' : 'missing';
  const lines = [
    `source: ${report.source.path} (${state})`,
    `documents scanned: ${report.documentsScanned}`,
    `impacts: ${report.counts.total} (linked ${report.counts.linked}, extracted ${report.counts.extracted}, local-link ${report.counts.localLink})`,
  ];
  for (const impact of report.impacts) {
    const target = [
      impact.sheet ? `#${impact.sheet}` : '',
      impact.place ? `|${impact.place}` : '',
    ].join('');
    lines.push(
      `  ${impact.document}:${impact.line} ${impact.relation} ${impact.resolution}${impact.kind ? ` [${impact.kind}]` : ''} ${impact.sourceReference}${target}`,
    );
  }
  return lines.join('\n');
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

function parseTabularHierarchyConfig(
  parentColumns: string | undefined,
  levelColumns: string | undefined,
): TabularHierarchyConfig | undefined {
  if (parentColumns && levelColumns) {
    throw new Error(
      '--tree-parent-columns and --tree-level-columns are mutually exclusive',
    );
  }
  if (parentColumns) {
    const columns = parentColumns
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (columns.length < 2 || columns.length > 3) {
      throw new Error(
        '--tree-parent-columns needs ID,Parent or ID,Parent,Label',
      );
    }
    return {
      mode: 'parent-id',
      idHeader: columns[0],
      parentHeader: columns[1],
      ...(columns[2] ? { labelHeader: columns[2] } : {}),
    };
  }
  if (levelColumns) {
    const columns = levelColumns
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (columns.length !== 2) {
      throw new Error('--tree-level-columns needs Level,Label');
    }
    return {
      mode: 'level',
      levelHeader: columns[0],
      labelHeader: columns[1],
    };
  }
  return undefined;
}
function parseFlatTextTreeMethods(
  value: string,
): readonly FlatTextTreeMethod[] {
  const methods = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (methods.length === 0) {
    throw new Error('--tree-method needs at least one method');
  }
  const allowed = new Set<FlatTextTreeMethod>(
    DEFAULT_FLAT_TEXT_TREE_METHODS,
  );
  const unique: FlatTextTreeMethod[] = [];
  for (const method of methods) {
    if (!allowed.has(method as FlatTextTreeMethod)) {
      throw new Error(
        `--tree-method supports: ${DEFAULT_FLAT_TEXT_TREE_METHODS.join(',')}`,
      );
    }
    if (!unique.includes(method as FlatTextTreeMethod)) {
      unique.push(method as FlatTextTreeMethod);
    }
  }
  return unique;
}

function portableDisplayPath(target: string): string {
  return path.relative(process.cwd(), target).split(path.sep).join('/')
    || path.basename(target);
}

function handoffPathWithinRoot(target: string, root: string): boolean {
  return pathWithinBoundaryForWrite(target, root);
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

export interface InspectTree {
  /** Format-native structural path. JSON/YAML use RFC 6901; XML uses element paths. */
  pointer: string;
  format?: 'json' | 'yaml' | 'xml' | 'text' | 'table';
  nodeType: 'object' | 'array' | 'element' | 'text-node' | 'row';
  childPointers: readonly string[];
  leafValues: readonly string[];
  sheet?: string;
  method?: FlatTextTreeMethod | TabularHierarchyConfig['mode'];
  status?: 'inferred' | 'abstained';
}

export interface InspectTreeHypothesis {
  method: FlatTextTreeMethod | TabularHierarchyConfig['mode'];
  status: 'inferred' | 'abstained';
  reasonCode: string;
  nodeCount: number;
  sheet?: string;
}

export interface InspectChoiceList {
  ordinal: number;
  sheet: string;
  range: string;
  sourceKind: 'inline' | 'range' | 'formula' | 'missing';
  formula1?: string;
  choices?: readonly string[];
  resolvedSource?: {
    sheet: string;
    range: string;
  };
  allowBlank: boolean;
}

export interface InspectNote {
  ordinal: number;
  sheet: string;
  cell: string;
  author?: string;
  characters: number;
  contentDigest: string;
}

export interface InspectLink {
  ordinal: number;
  sheet: string;
  ref: string;
  targetKind: LinkTargetKind;
  /** Target or in-workbook location as written; the link is never followed. */
  target: string;
  display?: string;
  contentDigest: string;
}

export interface InspectDocxSectionNode {
  level: number;
  text: string;
  structuralPath: string;
  contentPaths: string[];
  children: InspectDocxSectionNode[];
}

export interface InspectResult {
  source: string;
  /** Public machine-readable contract used by every item in candidates. */
  candidateContract: typeof SEMANTIC_CANDIDATE_CONTRACT;
  sheets: { name: string; usedRange?: string; regions: InspectRegion[] }[];
  /** Explicit or inferred hierarchy nodes; absent for non-Tree sources. */
  trees?: InspectTree[];
  /** Flat-text rule hypotheses stay separate instead of being auto-merged. */
  treeHypotheses?: InspectTreeHypothesis[];
  /** True when successful flat-text methods imply different edge sets. */
  treeAmbiguous?: boolean;
  /** The same structure as Semantic Candidates (issue-0193). */
  candidates: Candidate[];
  /** Read-only WordprocessingML observations (issue-0531). */
  docx?: {
    headings: {
      ordinal: number;
      level: number;
      text: string;
      structuralPath: string;
      fingerprint: string;
    }[];
    tables: {
      ordinal: number;
      rows: number;
      columns: number;
      structuralPath: string;
      explicitHeaderRow?: number;
      fingerprint: string;
    }[];
    images: {
      ordinal: number;
      name?: string;
      description?: string;
      mediaPart: string;
      format: string;
      bytes: number;
      digest: string;
      extractable: boolean;
      structuralPath: string;
    }[];
    comments: {
      ordinal: number;
      id: string;
      author?: string;
      date?: string;
      characters: number;
      structuralPath?: string;
      fingerprint: string;
    }[];
    sectionTree: {
      preamble: string[];
      roots: InspectDocxSectionNode[];
    };
  };
  /** Word package parts that could not be interpreted; one failure does not hide the rest. */
  docxDiagnostics?: DocxDiagnostic[];
  /** Read-only static HTML5 DOM candidates; no serialized HTML in inspect output. */
  htmlFragments?: {
    tagName: string;
    id?: string;
    structuralPath: string;
    kind: Candidate['kind'];
    fingerprint: string;
  }[];
  /** Embedded pictures of an .xlsx/.xlsm (empty for other sources). */
  images: InspectImage[];
  /** DrawingML AutoShape / connector objects. */
  shapes?: InspectShape[];
  /** Explicit list Data Validation occurrences from .xlsx/.xlsm. */
  choiceLists: InspectChoiceList[];
  /** Classic Excel cell Notes. Text stays in the Semantic Candidate; this summary is content-light. */
  notes: InspectNote[];
  /** Cell hyperlinks of an .xlsx/.xlsm. Targets are reported, never opened. */
  links?: InspectLink[];
  /** Hyperlinks that could not be read safely. */
  linkDiagnostics?: LinkDiagnostic[];
  /** Choice-list validations that could not be interpreted safely. */
  choiceListDiagnostics: ChoiceListDiagnostic[];
  /** Classic Note parts that could not be interpreted safely. */
  noteDiagnostics: NoteDiagnostic[];
  /** Pictures or drawings that could not be read, by name. */
  imageDiagnostics: ImageDiagnostic[];
  /**
   * Drawing-anchor regions that can be handed to `mmi snapshot`.
   * These are action hints, not claims that the drawing's meaning is known.
   */
  snapshotHints?: InspectSnapshotHint[];
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

export interface InspectSnapshotHint {
  ordinal: number;
  sheet: string;
  range?: string;
  fromCell?: string;
  anchorKind: string;
  shapeCount: number;
  graphicFrameCount: number;
  reasonCode: string;
  ready: boolean;
}

export interface InspectShape {
  ordinal: number;
  sheet: string;
  objectKind: 'shape' | 'connector';
  structuralPath: string;
  objectId?: string;
  name?: string;
  description?: string;
  textRuns: readonly string[];
  presetGeometry?: string;
  range?: string;
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

export function inspectSource(
  absolutePath: string,
  sampleRows: number,
  fromDocument?: string,
  flatTextMethods: readonly FlatTextTreeMethod[] = DEFAULT_FLAT_TEXT_TREE_METHODS,
  tabularHierarchy?: TabularHierarchyConfig,
  baseDirectory = process.cwd(),
): InspectResult {
  const base = fromDocument ? path.dirname(path.resolve(fromDocument)) : baseDirectory;
  let relative = path.relative(base, absolutePath).split(path.sep).join('/');
  if (!relative.startsWith('.')) relative = `./${relative}`;

  if (/\.html?$/iu.test(absolutePath)) {
    const bytes = fs.readFileSync(absolutePath);
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const parsed = readHtmlFragments(
      text,
      relative,
      createSourceIdentityFromBytes(bytes).digest,
    );
    return {
      source: relative,
      candidateContract: SEMANTIC_CANDIDATE_CONTRACT,
      candidates: [...parsed.candidates],
      htmlFragments: parsed.fragments.map((fragment) => ({
        tagName: fragment.tagName,
        ...(fragment.id !== undefined ? { id: fragment.id } : {}),
        structuralPath: fragment.structuralPath,
        kind: fragment.candidate.kind,
        fingerprint: fragment.candidate.fingerprint.digest,
      })),
      images: [],
      choiceLists: [],
      notes: [],
      choiceListDiagnostics: [],
      noteDiagnostics: [],
      imageDiagnostics: [],
      sheets: [],
    };
  }

  if (/\.docx$/iu.test(absolutePath)) {
    const bytes = fs.readFileSync(absolutePath);
    const parsed = readDocx(bytes, relative);
    return {
      source: relative,
      candidateContract: SEMANTIC_CANDIDATE_CONTRACT,
      candidates: [...parsed.candidates],
      docx: {
        headings: parsed.headings.map((heading) => ({
          ordinal: heading.ordinal,
          level: heading.level,
          text: heading.text,
          structuralPath: heading.structuralPath,
          fingerprint: heading.candidate.fingerprint.digest,
        })),
        tables: parsed.tables.map((item) => ({
          ordinal: item.ordinal,
          rows: item.rows,
          columns: item.columns,
          structuralPath: item.structuralPath,
          ...(item.explicitHeaderRow === undefined
            ? {}
            : { explicitHeaderRow: item.explicitHeaderRow }),
          fingerprint: item.candidate.fingerprint.digest,
        })),
        images: parsed.images.map((image) => ({
          ordinal: image.ordinal,
          ...(image.name === undefined ? {} : { name: image.name }),
          ...(image.description === undefined ? {} : { description: image.description }),
          mediaPart: image.mediaPart,
          format: image.format,
          bytes: image.bytes,
          digest: image.digest,
          extractable: image.extractable,
          structuralPath: image.structuralPath,
        })),
        comments: parsed.comments.map((comment) => ({
          ordinal: comment.ordinal,
          id: comment.id,
          ...(comment.author === undefined ? {} : { author: comment.author }),
          ...(comment.date === undefined ? {} : { date: comment.date }),
          characters: comment.text.length,
          ...(comment.structuralPath === undefined
            ? {}
            : { structuralPath: comment.structuralPath }),
          fingerprint: comment.candidate.fingerprint.digest,
        })),
        sectionTree: parsed.sectionTree,
      },
      docxDiagnostics: parsed.diagnostics,
      images: [],
      choiceLists: [],
      notes: [],
      choiceListDiagnostics: [],
      noteDiagnostics: [],
      imageDiagnostics: [],
      sheets: [],
    };
  }

  const standaloneTree = collectStandaloneTreeCandidates(
    absolutePath,
    relative,
    flatTextMethods,
  );
  if (standaloneTree) {
    return {
      source: relative,
      candidateContract: SEMANTIC_CANDIDATE_CONTRACT,
      candidates: [...standaloneTree.candidates],
      trees: standaloneTree.nodes.map((node) => ({
        pointer: node.pointer,
        format: node.format,
        nodeType: node.nodeType,
        childPointers: node.childPointers,
        leafValues: node.leafValues,
        ...(node.method ? { method: node.method } : {}),
        ...(node.status ? { status: node.status } : {}),
      })),
      ...(standaloneTree.hypotheses
        ? { treeHypotheses: [...standaloneTree.hypotheses] }
        : {}),
      ...(standaloneTree.ambiguous !== undefined
        ? { treeAmbiguous: standaloneTree.ambiguous }
        : {}),
      images: [],
      choiceLists: [],
      notes: [],
      choiceListDiagnostics: [],
      noteDiagnostics: [],
      imageDiagnostics: [],
      sheets: [],
    };
  }

  const workbookInventory = collectWorkbookCandidates(
    absolutePath,
    relative,
    {
      ...(tabularHierarchy ? { tabularHierarchy } : {}),
    },
  );
  const {
    workbook,
    imageRead,
    choiceRead,
    noteRead,
    linkRead,
    tablesBySheet,
    detected,
    hierarchies: tabularHierarchies,
  } = workbookInventory;

  return {
    source: relative,
    candidateContract: SEMANTIC_CANDIDATE_CONTRACT,
    candidates: [...workbookInventory.candidates],
    ...(tabularHierarchy
      ? {
          trees: tabularHierarchies.flatMap(({ sheetName, result }) =>
            result.nodes.map((node) => ({
              pointer: node.structuralPath,
              format: 'table' as const,
              nodeType: 'row' as const,
              sheet: sheetName,
              childPointers: node.childKeys.map(
                (key) =>
                  `table-hierarchy:${tabularHierarchy.mode}:id:${encodeURIComponent(key)}`,
              ),
              leafValues: [node.label],
              method: tabularHierarchy.mode,
              status: result.status,
            }))),
          treeHypotheses: tabularHierarchies.map(({ sheetName, result }) => ({
            method: tabularHierarchy.mode,
            status: result.status,
            reasonCode: result.reasonCode,
            nodeCount: result.nodes.length,
            sheet: sheetName,
          })),
          treeAmbiguous: false,
        }
      : {}),
    choiceLists: choiceRead.lists.map((item) => ({
      ordinal: item.ordinal,
      sheet: item.sheet,
      range: item.range,
      sourceKind: item.sourceKind,
      ...(item.formula1 ? { formula1: item.formula1 } : {}),
      ...(item.choices ? { choices: item.choices } : {}),
      ...(item.resolvedSource
        ? { resolvedSource: item.resolvedSource }
        : {}),
      allowBlank: item.allowBlank,
    })),
    notes: noteRead.notes.map((note) => ({
      ordinal: note.ordinal,
      sheet: note.sheet,
      cell: note.cell,
      ...(note.author !== undefined ? { author: note.author } : {}),
      characters: note.text.length,
      contentDigest: note.contentDigest,
    })),
    choiceListDiagnostics: choiceRead.diagnostics,
    noteDiagnostics: noteRead.diagnostics,
    links: linkRead.links.map((link) => ({
      ordinal: link.ordinal,
      sheet: link.sheet,
      ref: link.ref,
      targetKind: link.targetKind,
      target: link.target,
      ...(link.display !== undefined ? { display: link.display } : {}),
      contentDigest: link.contentDigest,
    })),
    linkDiagnostics: linkRead.diagnostics,
    shapes: imageRead.shapes.map((shape) => ({
      ordinal: shape.ordinal,
      sheet: shape.sheet,
      objectKind: shape.objectKind,
      structuralPath: shape.structuralPath,
      ...(shape.objectId ? { objectId: shape.objectId } : {}),
      ...(shape.name ? { name: shape.name } : {}),
      ...(shape.description ? { description: shape.description } : {}),
      textRuns: [...shape.textRuns],
      ...(shape.presetGeometry
        ? { presetGeometry: shape.presetGeometry }
        : {}),
      ...(shape.range ? { range: shape.range } : {}),
    })),
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
    snapshotHints: imageRead.snapshotHints.map((hint) => ({
      ordinal: hint.ordinal,
      sheet: hint.sheet,
      ...(hint.range ? { range: hint.range } : {}),
      ...(hint.anchor.from
        ? { fromCell: XLSX.utils.encode_cell({ c: hint.anchor.from.col, r: hint.anchor.from.row }) }
        : {}),
      anchorKind: hint.anchor.kind,
      shapeCount: hint.shapeCount,
      graphicFrameCount: hint.graphicFrameCount,
      reasonCode: hint.reasonCode,
      ready: Boolean(hint.range),
    })),
    imageDiagnostics: imageRead.diagnostics,
    sheets: detected.map(({ name, regions }) => {
      const sheet = workbook.sheets[name];
      return {
        name,
        ...(sheet.usedRange ? { usedRange: a1Of(sheet.usedRange) } : {}),
        regions: regions.map((region) => ({
          a1: region.a1,
          rows: region.range.endRow - region.range.startRow + 1,
          columns: region.range.endCol - region.range.startCol + 1,
          ...(region.title ? { title: region.title } : {}),
          ...(region.headers ? { headers: region.headers } : {}),
          headerConfidence: region.headerConfidence,
          notes: region.reasons,
          reference: regionReference(relative, region),
          ...(sampleRows > 0
            ? {
                sample: sliceRegion(sheet, region.a1).slice(
                  region.headers ? 1 : 0,
                  (region.headers ? 1 : 0) + sampleRows,
                ),
              }
            : {}),
        })),
      };
    }),
  };
}


function candidateDisplayKey(candidate: Candidate): string {
  return `${candidate.kind}\u0000${candidate.locator.sheet ?? ''}\u0000${placeOf(candidate)}`;
}

export function applyLedgerView(
  result: InspectResult,
  absoluteSource: string,
  ledgerPath: string,
  filter: CandidateLedgerFilter,
  similarityEvidencePath?: string,
  displayCwd = process.cwd(),
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
    choiceLists: result.choiceLists.filter((item) =>
      allowed.has(
        `choice-list\u0000${item.sheet}\u0000${item.range}`,
      )),
    notes: result.notes.filter((item) =>
      allowed.has(
        `note\u0000${item.sheet}\u0000${item.cell}`,
      )),
    ...(result.htmlFragments
      ? {
          htmlFragments: result.htmlFragments.filter((fragment) =>
            allowed.has(`${fragment.kind}\u0000\u0000path:${fragment.structuralPath}`)),
        }
      : {}),
    ...(result.links
      ? {
          links: result.links.filter((item) =>
            allowed.has(`link\u0000${item.sheet}\u0000${item.ref}`)),

        }
      : {}),
    ...(result.trees
      ? {
          trees: result.trees.filter((tree) =>
            allowed.has(
              `tree\u0000${tree.sheet ?? ''}\u0000path:${tree.pointer}`,
            )),
        }
      : {}),
    ...(result.docx
      ? {
          docx: {
            headings: result.docx.headings.filter((heading) =>
              allowed.has(`section\u0000\u0000path:${heading.structuralPath}`)),
            tables: result.docx.tables.filter((item) =>
              allowed.has(`table-range\u0000\u0000path:${item.structuralPath}`)),
            images: result.docx.images.filter((image) =>
              allowed.has(`image\u0000\u0000path:${image.structuralPath}`)),
            comments: result.docx.comments.filter((comment) =>
              allowed.has(
                `note\u0000\u0000path:${comment.structuralPath ?? `comments/comment[${comment.ordinal}]`}`,
              )),
            sectionTree: result.docx.sectionTree,
          },
        }
      : {}),
    sheets: result.sheets.map((sheet) => ({
      ...sheet,
      regions: sheet.regions.filter((region) =>
        allowed.has(`table-range\u0000${sheet.name}\u0000${region.a1}`)),
    })),
    ledger: {
      file: path.relative(displayCwd, ledgerPath).split(path.sep).join('/') || path.basename(ledgerPath),
      filter,
      ...(similarityEvidencePath
        ? { similarityEvidenceFile: path.relative(displayCwd, similarityEvidencePath).split(path.sep).join('/') || path.basename(similarityEvidencePath) }
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
  if (result.docx) {
    if (result.docx.headings.length > 0) {
      lines.push('', 'document headings (explicit styles/outline levels):');
      for (const heading of result.docx.headings) {
        lines.push(
          `  #${heading.ordinal}  level ${heading.level}  ${heading.structuralPath}  ${heading.text}${ledgerSuffix('section', '', `path:${heading.structuralPath}`)}`,
        );
      }
    }
    if (result.docx.sectionTree.preamble.length > 0
        || result.docx.sectionTree.roots.length > 0) {
      lines.push('', 'document section tree:');
      if (result.docx.sectionTree.preamble.length > 0) {
        lines.push(`  (preamble)  ${result.docx.sectionTree.preamble.length} block(s)`);
      }
      const printSections = (
        nodes: InspectDocxSectionNode[],
        depth: number,
      ): void => {
        for (const node of nodes) {
          lines.push(
            `  ${'  '.repeat(depth)}level ${node.level}  ${node.text}  ${node.structuralPath}  (${node.contentPaths.length} block(s))`,
          );
          printSections(node.children, depth + 1);
        }
      };
      printSections(result.docx.sectionTree.roots, 0);
    }
    if (result.docx.tables.length > 0) {
      lines.push('', 'document tables:');
      for (const item of result.docx.tables) {
        const header = item.explicitHeaderRow === undefined
          ? 'header: not stated'
          : `header: row ${item.explicitHeaderRow}`;
        lines.push(
          `  table #${item.ordinal}  ${item.rows} rows x ${item.columns} cols  ${header}  ${item.structuralPath}${ledgerSuffix('table-range', '', `path:${item.structuralPath}`)}`,
        );
      }
    }
    if (result.docx.images.length > 0) {
      lines.push('', 'document images:');
      for (const image of result.docx.images) {
        lines.push(
          `  image #${image.ordinal}  ${image.structuralPath}  ${image.format}  ${image.bytes} bytes  ${image.digest.slice(0, 19)}…${image.name ? `  "${image.name}"` : ''}${image.extractable ? '' : '  (not extractable)'}${ledgerSuffix('image', '', `path:${image.structuralPath}`)}`,
        );
      }
    }
    if (result.docx.comments.length > 0) {
      lines.push('', 'document comments (review only):');
      for (const comment of result.docx.comments) {
        const anchor = comment.structuralPath ?? '(no anchor)';
        lines.push(
          `  comment #${comment.ordinal}  id ${comment.id}  ${anchor}  ${comment.characters} chars${comment.author ? `  author: ${comment.author}` : ''}${ledgerSuffix('note', '', `path:${comment.structuralPath ?? `comments/comment[${comment.ordinal}]`}`)}`,
        );
      }
    }
  }
  if ((result.docxDiagnostics ?? []).length > 0) {
    lines.push('', 'Word document problems:');
    for (const item of result.docxDiagnostics ?? []) {
      const place = item.structuralPath ?? item.part;
      lines.push(`  ${item.code}${place ? ` ${place}` : ''}: ${item.message}`);
    }
  }
  if (result.treeHypotheses?.length) {
    lines.push(
      '',
      `tree hypotheses:${result.treeAmbiguous
        ? ' conflicting structures; review required'
        : ''}`,
    );
    for (const hypothesis of result.treeHypotheses) {
      lines.push(
        `  ${hypothesis.method}: ${hypothesis.status} (${hypothesis.reasonCode}, ${hypothesis.nodeCount} nodes)`,
      );
    }
  }
  if (result.htmlFragments?.length) {
    lines.push('', 'HTML fragments (observed DOM, no scripts executed):');
    for (const fragment of result.htmlFragments) {
      lines.push(
        `  ${fragment.structuralPath}  ${fragment.tagName}${fragment.id === undefined ? '' : `  #${fragment.id}`}  kind: ${fragment.kind}${ledgerSuffix(fragment.kind, '', `path:${fragment.structuralPath}`)}`,
      );
    }
  }
  if (result.trees?.length) {
    lines.push('', 'tree nodes:');
    for (const tree of result.trees) {
      const pointer = tree.pointer || '(root)';
      lines.push(
        `  ${pointer}${tree.sheet ? `  sheet: ${tree.sheet}` : ''}  ${tree.nodeType}${tree.method ? `  method: ${tree.method}` : ''}  ${tree.childPointers.length} children${ledgerSuffix('tree', tree.sheet ?? '', `path:${tree.pointer}`)}`,
      );
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
    for (
      const choice of result.choiceLists.filter(
        (item) => item.sheet === sheet.name,
      )
    ) {
      const summary = choice.choices
        ? `${choice.choices.length} choices: ${choice.choices.join(', ')}`
        : choice.formula1
          ? `source: ${choice.formula1} (values unresolved)`
          : 'source missing';
      const resolved = choice.resolvedSource
        ? `  from ${choice.resolvedSource.sheet}!${choice.resolvedSource.range}`
        : '';
      lines.push(
        `  choice-list #${choice.ordinal}  ${choice.range}  ${summary}${resolved}${choice.allowBlank ? '  allow blank' : ''}${ledgerSuffix('choice-list', sheet.name, choice.range)}`,
      );
    }
    for (const note of result.notes.filter((item) => item.sheet === sheet.name)) {
      lines.push(
        `  note #${note.ordinal}  ${note.cell}  ${note.characters} chars  ${note.contentDigest.slice(0, 19)}…${note.author !== undefined ? `  author: ${note.author}` : ''}${ledgerSuffix('note', sheet.name, note.cell)}  (review only)`,
      );
    }
    for (const link of (result.links ?? []).filter((item) => item.sheet === sheet.name)) {
      lines.push(
        `  link #${link.ordinal}  ${link.ref}  ${link.targetKind}  ${link.target}${link.display !== undefined ? `  "${link.display}"` : ''}${ledgerSuffix('link', sheet.name, link.ref)}  (not followed)`,
      );
    }
    for (const image of result.images.filter((item) => item.sheet === sheet.name)) {
      const near = image.nearbyTable ? `  near table ${image.nearbyTable.range} (${image.nearbyTable.relation}, gap ${image.nearbyTable.gap})` : '';
      const place = image.range ?? `name:${image.name ?? ''}`;
      lines.push(`  image #${image.ordinal}  ${image.range ?? '(no cell anchor)'}  ${image.format}  ${image.bytes} bytes  ${image.digest.slice(0, 19)}…${image.name ? `  "${image.name}"` : ''}${near}${image.extractable ? '' : '  (not extractable)'}${ledgerSuffix('image', sheet.name, place)}`);
    }
    for (const shape of (result.shapes ?? []).filter((item) => item.sheet === sheet.name)) {
      const text = shape.textRuns.length > 0
        ? `  text: ${shape.textRuns.join(' / ')}`
        : '';
      const geometry = shape.presetGeometry
        ? `  geometry: ${shape.presetGeometry}`
        : '';
      lines.push(
        `  ${shape.objectKind} #${shape.ordinal}  ${shape.range ?? '(no cell anchor)'}${shape.name ? `  "${shape.name}"` : ''}${geometry}${text}${ledgerSuffix('shape', sheet.name, `path:${shape.structuralPath}`)}  (review only)`,
      );
    }
    for (const hint of (result.snapshotHints ?? []).filter((item) => item.sheet === sheet.name)) {
      const objects = [
        hint.shapeCount > 0 ? `${hint.shapeCount} shape/connector` : '',
        hint.graphicFrameCount > 0 ? `${hint.graphicFrameCount} graphic-frame` : '',
      ].filter(Boolean).join(', ');
      if (hint.range) {
        lines.push(
          `  snapshot hint #${hint.ordinal}  ${hint.range}  ${objects}  (snapshot --hint ${hint.ordinal} ready)`,
        );
      } else {
        lines.push(
          `  snapshot hint #${hint.ordinal}  ${hint.fromCell ?? '(absolute anchor)'}  ${objects}  (range needs review: ${hint.reasonCode})`,
        );
      }
    }
  }
  if (result.choiceListDiagnostics.length > 0) {
    lines.push(
      '',
      'choice-list problems:',
      ...result.choiceListDiagnostics.map(
        (item) =>
          `  ${item.code}${item.sheet ? ` ${item.sheet}` : ''}: ${item.message}`,
      ),
    );
  }
  if (result.noteDiagnostics.length > 0) {
    lines.push(
      '',
      'note problems:',
      ...result.noteDiagnostics.map(
        (item) =>
          `  ${item.code}${item.sheet ? ` ${item.sheet}` : ''}${item.cell ? `!${item.cell}` : ''}: ${item.message}`,
      ),
    );
  }
  if ((result.linkDiagnostics ?? []).length > 0) {
    lines.push(
      '',
      'link problems:',
      ...(result.linkDiagnostics ?? []).map(
        (item) =>
          `  ${item.code}${item.sheet ? ` ${item.sheet}` : ''}${item.cell ? `!${item.cell}` : ''}: ${item.message}`,
      ),
    );
  }
  if (result.imageDiagnostics.length > 0) lines.push('', 'drawing problems:', ...formatImageDiagnostics(result.imageDiagnostics).map((line) => `  ${line}`));
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

export async function checkPaths(files: string[], root: string, displayCwd = process.cwd()): Promise<CheckProblem[]> {
  const cache = new WorkbookCache<WorkbookData>();
  const locale = cliMessageLanguage();
  const problems: CheckProblem[] = [];
  for (const file of files) {
    const absolute = path.resolve(file);
    const text = fs.readFileSync(absolute, 'utf8');
    const items = await createDiagnosticsForDocument(text, absolute, root, {
      locale,
      fileExists: async (filepath) => fs.existsSync(filepath) && fs.statSync(filepath).isFile(),
      readFile: async (filepath) => fs.readFileSync(filepath),
      readWorkbookSheetNames: async (filepath) => Object.keys(loadWorkbook({ absolutePath: filepath, cache }).sheets),
      loadWorkbook: (filepath) => loadWorkbook({ absolutePath: filepath, cache }),
      loadStructure: (filepath, workbook) => readWorkbookStructure(filepath, workbook),
    });
    for (const { diagnostic, range } of items) {
      problems.push({
        file: path.relative(displayCwd, absolute).split(path.sep).join('/'),
        line: range.start.line + 1,
        column: range.start.character + 1,
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
      });
    }
    // Prose IDs the referenced sheets do not have (warnings; the reference errors above stay the gate).
    const displayFile = path.relative(displayCwd, absolute).split(path.sep).join('/');
    for (const finding of findUnknownProseIds(text, referencedSheets(text, absolute, root, cache))) {
      problems.push({
        file: displayFile,
        line: finding.line,
        column: finding.column,
        severity: 'warning',
        code: UNKNOWN_PROSE_ID_CODE,
        message: unknownIdMessage(finding, cliMessageLanguage()),
      });
    }
  }
  return problems;
}

export function collectMarkdownFiles(target: string): string[] {
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
    console.error(`mmi: ${cliErrorText(error)}`);
    process.exitCode = 2;
  });
}
