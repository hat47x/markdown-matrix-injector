#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnPlan } from './npm-spawn.mjs';

export function verifyCliPackage(tarballPath) {
  if (!fs.existsSync(tarballPath)) {
    throw new Error(`CLI tarball is missing: ${tarballPath}`);
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-cli-package-'));
  try {
    const prefix = path.join(root, 'install');
  const cache = path.join(root, 'empty-npm-cache');
  const workspace = path.join(root, 'workspace');
  const docs = path.join(workspace, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.mkdirSync(cache, { recursive: true });

  runNpm([
    'install',
    '--prefix',
    prefix,
    '--cache',
    cache,
    '--ignore-scripts',
    '--offline',
    '--no-audit',
    '--no-fund',
    tarballPath,
  ], root);

  const packageRoot = path.join(
    prefix,
    'node_modules',
    'markdown-matrix-injector',
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  if (packageJson.bin?.mmi !== './dist/src/cli/bootstrap.js') {
    throw new Error('Installed CLI package does not expose the expected mmi binary.');
  }
  if (packageJson.bin?.['mmi-mcp'] !== './dist/src/cli/mcp-bootstrap.js') {
    throw new Error('Installed CLI package does not expose the expected mmi-mcp binary.');
  }

  const bin = path.join(
    prefix,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'mmi.cmd' : 'mmi',
  );
  if (!fs.existsSync(bin)) {
    throw new Error(`Installed mmi binary is missing: ${bin}`);
  }
  const mcpBin = path.join(
    prefix,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'mmi-mcp.cmd' : 'mmi-mcp',
  );
  if (!fs.existsSync(mcpBin)) {
    throw new Error(`Installed mmi-mcp binary is missing: ${mcpBin}`);
  }

  fs.writeFileSync(
    path.join(workspace, 'data.csv'),
    'ID,Name\n1,Alpha\n',
  );
  fs.writeFileSync(
    path.join(docs, 'spec.md'),
    '# Spec\n\n![[../data.csv#Sheet1|A1:B2?header=first]]\n',
  );
  fs.writeFileSync(
    path.join(workspace, 'service.json'),
    JSON.stringify({
      service: {
        name: 'billing',
        endpoints: [{ path: '/pay', method: 'POST' }],
      },
    }, null, 2) + '\n',
  );
  fs.writeFileSync(
    path.join(workspace, 'service.xml'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svc:service xmlns:svc="urn:service" id="billing">',
      '<svc:endpoint method="POST">/pay</svc:endpoint>',
      '</svc:service>',
    ].join(''),
  );
  fs.writeFileSync(
    path.join(workspace, 'service.yaml'),
    [
      'service:',
      '  name: billing',
      '  endpoints:',
      '    - path: /pay',
      '      method: POST',
      '',
    ].join('\n'),
  );

  // Independent HTML fixture verifies that the distributed CLI actually
  // includes the HTML5 parser and can inspect the same source without network.
  const htmlSource = path.join(workspace, 'design.html');
  const originalHtml = [
    '<!doctype html><html lang="ja"><body>',
    '<main id="spec">',
    '<section id="intro"><h2>Introduction</h2>',
    '<p>See <a href="#api">API</a>.</p></section>',
    '<section id="api"><h2>API specification</h2></section>',
    '</main></body></html>',
  ].join('');
  fs.writeFileSync(htmlSource, originalHtml);

  const help = run(bin, ['--help'], workspace);
  const version = run(bin, ['--version'], workspace);
  const versionJson = run(bin, ['--version', '--json'], workspace);
  const candidateSchema = run(
    bin,
    ['schema', 'candidate'],
    workspace,
  );
  const ledgerSchema = run(
    bin,
    ['schema', 'ledger'],
    workspace,
  );
  const reviewDecisionsSchema = run(
    bin,
    ['schema', 'review-decisions'],
    workspace,
  );
  const check = run(bin, ['check', 'docs', '--root', '.'], workspace);
  const render = run(
    bin,
    ['render', 'docs/spec.md', '--root', '.'],
    workspace,
  );
  const treeInspect = run(
    bin,
    ['inspect', 'service.json', '--root', '.', '--json'],
    workspace,
  );
  const treeExtract = run(
    bin,
    [
      'extract',
      'service.json',
      '--tree',
      '/service',
      '--out-dir',
      'tree-assets',
      '--root',
      '.',
      '--json',
    ],
    workspace,
  );
  const xmlTreeInspect = run(
    bin,
    ['inspect', 'service.xml', '--root', '.', '--json'],
    workspace,
  );
  const xmlTreeExtract = run(
    bin,
    [
      'extract',
      'service.xml',
      '--tree',
      '/svc:service[1]/svc:endpoint[1]',
      '--out-dir',
      'xml-tree-assets',
      '--root',
      '.',
      '--json',
    ],
    workspace,
  );
  const yamlTreeInspect = run(
    bin,
    ['inspect', 'service.yaml', '--root', '.', '--json'],
    workspace,
  );
  const yamlTreeExtract = run(
    bin,
    [
      'extract',
      'service.yaml',
      '--tree',
      '/service',
      '--out-dir',
      'yaml-tree-assets',
      '--root',
      '.',
      '--json',
    ],
    workspace,
  );

  const htmlInspect = run(
    bin,
    ['inspect', 'design.html', '--root', '.', '--json'],
    workspace,
  );
  let inspectedHtml;
  try {
    inspectedHtml = JSON.parse(htmlInspect.stdout);
  } catch {
    throw new Error(
      `mmi inspect HTML returned invalid JSON:\n${htmlInspect.stderr || htmlInspect.stdout}`,
    );
  }
  const inspectedApi = inspectedHtml.htmlFragments?.find(
    (fragment) => fragment.id === 'api',
  );
  const inspectedIntro = inspectedHtml.htmlFragments?.find(
    (fragment) => fragment.id === 'intro',
  );
  if (htmlInspect.status !== 0
    || !inspectedApi?.fingerprint
    || !inspectedIntro?.fingerprint
    || !inspectedHtml.candidates?.some((candidate) => candidate.kind === 'section')) {
    throw new Error(
      `mmi inspect HTML failed:\n${htmlInspect.stderr || htmlInspect.stdout}`,
    );
  }

  fs.writeFileSync(
    path.join(workspace, 'html-plan.json'),
    JSON.stringify({
      fragments: [
        {
          id: 'intro',
          output: 'docs/intro.html',
          expectedFingerprint: inspectedIntro.fingerprint,
        },
        {
          id: 'api',
          output: 'docs/api.html',
          expectedFingerprint: inspectedApi.fingerprint,
        },
      ],
    }),
  );
  const htmlPlan = run(
    bin,
    ['html-plan', 'design.html', '--plan', 'html-plan.json', '--root', '.', '--json'],
    workspace,
  );
  let inspectedHtmlPlan;
  try {
    inspectedHtmlPlan = JSON.parse(htmlPlan.stdout);
  } catch {
    throw new Error(
      `mmi html-plan returned invalid JSON:\n${htmlPlan.stderr || htmlPlan.stdout}`,
    );
  }
  if (htmlPlan.status !== 0
    || inspectedHtmlPlan.hasIdentifiedBlockers
    || !inspectedHtmlPlan.anchors?.some(
      (anchor) => anchor.sourceId === 'intro'
        && anchor.status === 'cross-output'
        && anchor.proposedHref === 'api.html#api')) {
    throw new Error(
      `mmi html-plan failed:\n${htmlPlan.stderr || htmlPlan.stdout}`,
    );
  }

  // Save the two-fragment plan using an explicitly reviewed source snapshot.
  // This is the normal-failure guarded write path, NOT a crash-atomic test.
  const htmlCommitPlan = JSON.parse(
    fs.readFileSync(path.join(workspace, 'html-plan.json'), 'utf8'),
  );
  htmlCommitPlan.sourceDigest = inspectedHtml.candidates?.find(
    (candidate) => candidate.locator?.sourceDigest,
  )?.locator.sourceDigest;
  if (!/^sha256:[0-9a-f]{64}$/u.test(htmlCommitPlan.sourceDigest ?? '')) {
    throw new Error('mmi inspect HTML did not expose source digest for reviewed commit');
  }
  fs.writeFileSync(
    path.join(workspace, 'html-commit-plan.json'),
    JSON.stringify(htmlCommitPlan),
  );
  const htmlCommitWithoutFlag = run(bin, [
    'html-commit', 'design.html', '--plan', 'html-commit-plan.json', '--root', '.',
  ], workspace);
  if (htmlCommitWithoutFlag.status === 0
      || fs.existsSync(path.join(docs, 'intro.html'))) {
    throw new Error('mmi html-commit wrote output without explicit --commit');
  }
  const htmlCommit = run(bin, [
    'html-commit', 'design.html', '--plan', 'html-commit-plan.json',
    '--root', '.', '--commit', '--json',
  ], workspace);
  let committedHtml;
  try {
    committedHtml = JSON.parse(htmlCommit.stdout);
  } catch {
    throw new Error(
      `mmi html-commit returned invalid JSON:\n${htmlCommit.stderr || htmlCommit.stdout}`,
    );
  }
  if (htmlCommit.status !== 0
    || committedHtml.files?.length !== 2
    || !fs.existsSync(path.join(docs, 'intro.html'))
    || !fs.existsSync(path.join(docs, 'api.html'))
    || !fs.readFileSync(path.join(docs, 'intro.html'), 'utf8')
      .includes('href="api.html#api"')
    || fs.readFileSync(htmlSource, 'utf8') !== originalHtml) {
    throw new Error(
      `mmi html-commit failed or modified source:\n${htmlCommit.stderr || htmlCommit.stdout}`,
    );
  }

  const auditArgs = [
    'html-audit', 'design.html', '--plan', 'html-commit-plan.json',
    '--root', '.', '--json',
  ];
  const htmlAudit = run(bin, auditArgs, workspace);
  let auditedHtml;
  try {
    auditedHtml = JSON.parse(htmlAudit.stdout);
  } catch {
    throw new Error(
      `mmi html-audit returned invalid JSON:\n${htmlAudit.stderr || htmlAudit.stdout}`,
    );
  }
  if (htmlAudit.status !== 0
    || auditedHtml.status !== 'complete'
    || auditedHtml.consistentAtObservation !== true
    || auditedHtml.files?.length !== 2
    || auditedHtml.files.some((file) =>
      file.file !== 'matching' || file.ledger !== 'matching')) {
    throw new Error(
      `mmi html-audit failed to confirm two-file batch:\n${htmlAudit.stderr || htmlAudit.stdout}`,
    );
  }
  // A non-destructive audit must not silently recreate a missing output.
  const htmlApiOutput = path.join(docs, 'api.html');
  const apiBytes = fs.readFileSync(htmlApiOutput);
  fs.unlinkSync(htmlApiOutput);
  const incompleteAudit = run(bin, auditArgs, workspace);
  let incomplete;
  try {
    incomplete = JSON.parse(incompleteAudit.stdout);
  } catch {
    throw new Error(
      `mmi html-audit did not produce diagnostics for missing output:\n${incompleteAudit.stderr || incompleteAudit.stdout}`,
    );
  }
  if (incompleteAudit.status === 0 || incomplete.status !== 'incomplete'
    || !incomplete.files?.some((file) =>
      file.output === 'docs/api.html' && file.file === 'missing')
    || fs.existsSync(htmlApiOutput)) {
    throw new Error('mmi html-audit incorrectly accepted or repaired missing HTML output');
  }
  // Restore fixture bytes in this isolated verification workspace only.
  fs.writeFileSync(htmlApiOutput, apiBytes);

  if (help.status !== 0 || !help.stdout.includes('Usage: mmi')) {
    throw new Error(`mmi --help failed:\n${help.stderr || help.stdout}`);
  }
  if (
    version.status !== 0
    || version.stdout.trim() !== packageJson.version
  ) {
    throw new Error(
      `mmi --version did not match installed package version: expected ${packageJson.version}, got ${version.stdout.trim() || version.stderr.trim()}`,
    );
  }
  const assertTarballIdentity = (identity, label) => {
    if (
      identity?.schema !== 'mmi.build-identity/v1'
      || identity.version !== packageJson.version
      || identity.distribution !== 'tarball'
      || !/^sha256:[0-9a-f]{64}$/u.test(identity.lockfileDigest ?? '')
      || identity.node?.version !== process.version
      || identity.node?.major !== Number.parseInt(process.versions.node, 10)
      || (identity.commit !== null && !/^[0-9a-f]{40}$/u.test(identity.commit))
    ) {
      throw new Error(`${label} did not return a valid tarball build identity: ${JSON.stringify(identity)}`);
    }
  };
  let versionIdentity;
  try {
    versionIdentity = JSON.parse(versionJson.stdout);
  } catch {
    throw new Error(`mmi --version --json returned invalid JSON:
${versionJson.stderr || versionJson.stdout}`);
  }
  assertTarballIdentity(versionIdentity, 'mmi --version --json');
  let parsedCandidateSchema;
  try {
    parsedCandidateSchema = JSON.parse(candidateSchema.stdout);
  } catch {
    throw new Error(
      `mmi schema candidate returned invalid JSON:\n${candidateSchema.stderr || candidateSchema.stdout}`,
    );
  }
  if (
    candidateSchema.status !== 0
    || parsedCandidateSchema['x-mmi-contract']
      !== 'mmi.semantic-candidate/v1'
  ) {
    throw new Error(
      `mmi schema candidate failed:\n${candidateSchema.stderr || candidateSchema.stdout}`,
    );
  }
  for (const [name, runResult, expectedContract] of [
    ['ledger', ledgerSchema, 'mmi.ledger/v1'],
    ['review-decisions', reviewDecisionsSchema, 'mmi.review-decisions/v1'],
  ]) {
    let parsed;
    try {
      parsed = JSON.parse(runResult.stdout);
    } catch {
      throw new Error(
        `mmi schema ${name} returned invalid JSON:\n${runResult.stderr || runResult.stdout}`,
      );
    }
    if (
      runResult.status !== 0
      || parsed['x-mmi-contract'] !== expectedContract
    ) {
      throw new Error(
        `mmi schema ${name} failed:\n${runResult.stderr || runResult.stdout}`,
      );
    }
  }
  if (check.status !== 0) {
    throw new Error(`mmi check failed:\n${check.stderr || check.stdout}`);
  }
  if (
    render.status !== 0
    || !render.stdout.includes('| ID | Name |')
    || !render.stdout.includes('| 1 | Alpha |')
  ) {
    throw new Error(`mmi render failed:\n${render.stderr || render.stdout}`);
  }

  // MCP smoke: initialize, tools/list and one read-only inspect, over the same
  // line-delimited stdio transport the installed package exposes.
  const mcpEntry = path.join(packageRoot, 'dist', 'src', 'cli', 'mcp-bootstrap.js');
  const mcp = runMcp(mcpEntry, [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mmi-cli-package-smoke', version: '0' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'inspect', arguments: { source: 'service.json' } },
    },
    {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: {
        name: 'html-audit',
        arguments: { source: 'design.html', plan: 'html-commit-plan.json' },
      },
    },
  ], workspace);
  const mcpResponses = mcp.stdout
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
  const initialized = mcpResponses.find((response) => response.id === 1);
  const listed = mcpResponses.find((response) => response.id === 2);
  const inspected = mcpResponses.find((response) => response.id === 3);
  const auditedByMcp = mcpResponses.find((response) => response.id === 4);
  if (
    mcp.status !== 0
    || initialized?.result?.protocolVersion !== '2024-11-05'
    || !listed?.result?.tools?.some((tool) => tool.name === 'inspect')
    || !listed.result.tools.some((tool) => tool.name === 'check')
    || !listed.result.tools.some((tool) => tool.name === 'schema')
    || !listed.result.tools.some((tool) => tool.name === 'html-audit')
    || listed.result.tools.some((tool) => tool.name === 'html-commit')
  ) {
    throw new Error(
      `mmi-mcp initialize/tools/list failed:\n${mcp.stderr || mcp.stdout}`,
    );
  }
  assertTarballIdentity(
    initialized.result._meta?.['mmi/buildIdentity'],
    'mmi-mcp initialize _meta',
  );
  let inspectedByMcp;
  try {
    inspectedByMcp = JSON.parse(inspected?.result?.content?.[0]?.text ?? '');
  } catch {
    throw new Error(`mmi-mcp inspect returned invalid JSON:\n${mcp.stdout}`);
  }
  if (
    inspected?.result?.isError === true
    || inspectedByMcp.candidateContract !== 'mmi.semantic-candidate/v1'
    || !inspectedByMcp.candidates?.some(
      (candidate) => candidate.kind === 'tree',
    )
  ) {
    throw new Error(`mmi-mcp inspect failed:\n${mcp.stdout}`);
  }

  let auditedByMcpReport;
  try {
    auditedByMcpReport = JSON.parse(auditedByMcp?.result?.content?.[0]?.text ?? '');
  } catch {
    throw new Error(`mmi-mcp html-audit returned invalid JSON:\n${mcp.stdout}`);
  }
  if (auditedByMcp?.result?.isError === true
    || auditedByMcpReport.status !== 'complete'
    || JSON.stringify(auditedByMcpReport) !== JSON.stringify(auditedHtml)) {
    throw new Error(`mmi-mcp html-audit disagreed with read-only CLI report:\n${mcp.stdout}`);
  }

  // The shared ledger records the most recent extraction for each occurrence.
  // Audit the reviewed batch BEFORE the legacy single-fragment extraction
  // replaces the same API occurrence in that ledger.
  const htmlExtract = run(
    bin,
    [
      'extract', 'design.html',
      '--html-id', 'api',
      '--expected-fingerprint', inspectedApi.fingerprint,
      '--root', '.', '--json',
    ],
    workspace,
  );
  let extractedHtml;
  try {
    extractedHtml = JSON.parse(htmlExtract.stdout);
  } catch {
    throw new Error(
      `mmi extract HTML returned invalid JSON:\n${htmlExtract.stderr || htmlExtract.stdout}`,
    );
  }
  if (htmlExtract.status !== 0
    || extractedHtml.fragmentFingerprint !== inspectedApi.fingerprint
    || !extractedHtml.path
    || !fs.existsSync(extractedHtml.path)
    || !fs.readFileSync(extractedHtml.path, 'utf8').includes('id="api"')
    || fs.readFileSync(htmlSource, 'utf8') !== originalHtml) {
    throw new Error(
      `mmi extract HTML failed or modified its source:\n${htmlExtract.stderr || htmlExtract.stdout}`,
    );
  }


  let inspectedTree;
  let extractedTree;
  try {
    inspectedTree = JSON.parse(treeInspect.stdout);
    extractedTree = JSON.parse(treeExtract.stdout);
  } catch {
    throw new Error(
      `mmi JSON Tree smoke returned invalid JSON:\n${treeInspect.stderr || treeInspect.stdout}\n${treeExtract.stderr || treeExtract.stdout}`,
    );
  }
  if (
    treeInspect.status !== 0
    || !inspectedTree.candidates?.some(
      (candidate) =>
        candidate.kind === 'tree'
        && candidate.locator?.structuralPath === '/service',
    )
  ) {
    throw new Error(
      `mmi inspect JSON Tree failed:\n${treeInspect.stderr || treeInspect.stdout}`,
    );
  }
  if (
    treeExtract.status !== 0
    || extractedTree.extracted?.pointer !== '/service'
    || !extractedTree.extracted?.file
    || !fs.existsSync(extractedTree.extracted.file)
  ) {
    throw new Error(
      `mmi extract JSON Tree failed:\n${treeExtract.stderr || treeExtract.stdout}`,
    );
  }
  let inspectedXmlTree;
  let extractedXmlTree;
  try {
    inspectedXmlTree = JSON.parse(xmlTreeInspect.stdout);
    extractedXmlTree = JSON.parse(xmlTreeExtract.stdout);
  } catch {
    throw new Error(
      `mmi XML Tree smoke returned invalid JSON:\n${xmlTreeInspect.stderr || xmlTreeInspect.stdout}\n${xmlTreeExtract.stderr || xmlTreeExtract.stdout}`,
    );
  }
  if (
    xmlTreeInspect.status !== 0
    || !inspectedXmlTree.candidates?.some(
      (candidate) =>
        candidate.kind === 'tree'
        && candidate.locator?.structuralPath
          === '/svc:service[1]/svc:endpoint[1]',
    )
  ) {
    throw new Error(
      `mmi inspect XML Tree failed:\n${xmlTreeInspect.stderr || xmlTreeInspect.stdout}`,
    );
  }
  if (
    xmlTreeExtract.status !== 0
    || extractedXmlTree.extracted?.pointer
      !== '/svc:service[1]/svc:endpoint[1]'
    || !extractedXmlTree.extracted?.file
    || !fs.existsSync(extractedXmlTree.extracted.file)
  ) {
    throw new Error(
      `mmi extract XML Tree failed:\n${xmlTreeExtract.stderr || xmlTreeExtract.stdout}`,
    );
  }

  let inspectedYamlTree;
  let extractedYamlTree;
  try {
    inspectedYamlTree = JSON.parse(yamlTreeInspect.stdout);
    extractedYamlTree = JSON.parse(yamlTreeExtract.stdout);
  } catch {
    throw new Error(
      `mmi YAML Tree smoke returned invalid JSON:\n${yamlTreeInspect.stderr || yamlTreeInspect.stdout}\n${yamlTreeExtract.stderr || yamlTreeExtract.stdout}`,
    );
  }
  if (
    yamlTreeInspect.status !== 0
    || !inspectedYamlTree.candidates?.some(
      (candidate) =>
        candidate.kind === 'tree'
        && candidate.locator?.structuralPath === '/service',
    )
  ) {
    throw new Error(
      `mmi inspect YAML Tree failed:\n${yamlTreeInspect.stderr || yamlTreeInspect.stdout}`,
    );
  }
  if (
    yamlTreeExtract.status !== 0
    || extractedYamlTree.extracted?.pointer !== '/service'
    || !extractedYamlTree.extracted?.file
    || !fs.existsSync(extractedYamlTree.extracted.file)
  ) {
    throw new Error(
      `mmi extract YAML Tree failed:\n${yamlTreeExtract.stderr || yamlTreeExtract.stdout}`,
    );
  }

  const ledger = JSON.parse(
    fs.readFileSync(path.join(workspace, 'mmi-ledger.json'), 'utf8'),
  );
  if (
    !ledger.entries?.some(
      (entry) =>
        entry.kind === 'tree'
        && entry.place === 'path:/service'
        && entry.reviewState === 'accepted',
    )
  ) {
    throw new Error('mmi extract JSON Tree did not record the shared import ledger.');
  }
  if (!ledger.entries?.some((entry) =>
    entry.kind === 'section'
    && entry.reviewState === 'accepted'
    && entry.fingerprint.digest === inspectedApi.fingerprint
    && entry.outputDigest === extractedHtml.outputDigest)) {
    throw new Error('mmi extract HTML did not record the shared import ledger.');
  }


    return {
      schema: 'mmi.cli-package-verification/v1',
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      package: {
        name: packageJson.name,
        version: packageJson.version,
      },
      checks: {
        isolatedOfflineInstall: 'passed',
        bin: 'passed',
        help: 'passed',
        version: 'passed',
        candidateSchema: 'passed',
        ledgerSchema: 'passed',
        reviewDecisionsSchema: 'passed',
        check: 'passed',
        render: 'passed',
        mcpInitialize: 'passed',
        mcpToolsList: 'passed',
        mcpInspect: 'passed',
        jsonTreeInspect: 'passed',
        jsonTreeExtract: 'passed',
        jsonTreeLedger: 'passed',
        xmlTreeInspect: 'passed',
        xmlTreeExtract: 'passed',
        yamlTreeInspect: 'passed',
        yamlTreeExtract: 'passed',
        htmlInspect: 'passed',
        htmlPlan: 'passed',
        htmlExtract: 'passed',
        htmlLedger: 'passed',
        htmlBatchCommit: 'passed',
        htmlReadOnlyAudit: 'passed',
        htmlAuditDetectsMissing: 'passed',
        mcpHtmlReadOnlyAudit: 'passed',
      },
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runNpm(args, cwd) {
  const plan = spawnPlan('npm', args);
  const result = spawnSync(plan.file, plan.args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: plan.shell,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `npm ${args.join(' ')} failed with exit ${result.status}:\n${result.stderr}`,
    );
  }
  return result;
}

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function runMcp(entry, messages, cwd) {
  const result = spawnSync(process.execPath, [entry], {
    cwd,
    encoding: 'utf8',
    input: `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}


function isMainModule() {
  return process.argv[1]
    && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  const tarball = process.argv[2];
  if (!tarball) {
    console.error('usage: node scripts/verify-cli-package.mjs <mmi-cli.tgz>');
    process.exitCode = 2;
  } else {
    try {
      const result = verifyCliPackage(path.resolve(tarball));
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
      console.error(
        `mmi cli package verification: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
  }
}
