import { runIntegrationTests } from './extensionHost.test.js';

const LOG_PREFIX = '[mmi:e2e:suite]';

export async function run(): Promise<void> {
  const startedAtMs = Date.now();

  process.on('uncaughtException', (error) => {
    console.error(`${LOG_PREFIX} uncaught-exception`);
    console.error(error);
  });

  process.on('unhandledRejection', (reason) => {
    console.error(`${LOG_PREFIX} unhandled-rejection`);
    console.error(reason);
  });

  console.log(
    `${LOG_PREFIX} start ${JSON.stringify({
      host: 'extension-host',
      workspace: process.env.MMI_E2E_WORKSPACE ?? '(unset)',
      display: process.env.DISPLAY ?? '(unset)',
      wayland: process.env.WAYLAND_DISPLAY ?? '(unset)',
      verificationBoundary: [
        'native-provider-surface',
        'fallback-compatibility',
        'shared-logic-reuse',
      ],
      autocompleteIsolationBoundary: 'Known unstable autocomplete is logged separately and remains outside the paste/drop proof boundary.',
      triageBoundary: {
        suiteResponsibility: 'Summarize proof boundary and next-step order only; do not infer product decisions from a single failing run.',
        firstTriageOrder: [
          'environment-prerequisite',
          'paste-drop-provider-*',
          'autocomplete-known-unstable',
          'unknown',
        ],
        environmentPrerequisite:
          'Missing DISPLAY/xvfb or Extension Host bootstrap issues are categorized before extensionHost.test.ts assertions run. If issue-0010 assertion markers never appear, suspect entry-condition failure first.',
        pasteDropBoundary:
          'Paste/drop acceptance covers provider surface, fallback compatibility, and shared logic reuse only after environment triage is already clear and issue-0010 assertion markers are present.',
        knownUnstableIsolation:
          'Autocomplete instability is logged separately and should not be used to fail paste/drop acceptance unless provider-specific assertion markers also fail.',
        nativeFallbackGuardrail: 'Do not start native-fallback design debate unless fallback compatibility evidence also fails after environment triage.',
      },
    })}`,
  );

  try {
    await runIntegrationTests();
    console.log(`${LOG_PREFIX} success ${JSON.stringify({ durationMs: Date.now() - startedAtMs })}`);
  } catch (error) {
    console.error(
      `${LOG_PREFIX} failure ${JSON.stringify({
        durationMs: Date.now() - startedAtMs,
        stageHint: 'extensionHost.test.ts',
        responsibilityHint:
          'Suite output is boundary guidance only. Follow runner category first: environment-prerequisite means fix display/xvfb or Extension Host bootstrap before reading assertions, especially if issue-0010 assertion markers never appeared; paste-drop-provider-* means compare provider surface, fallback compatibility, and DataTransfer evidence only after environment triage is clean and the assertion-stage markers are visible; autocomplete-known-unstable means keep paste/drop work isolated; unknown means collect logs and stop short of policy debate.',
        nextStepOrder: [
          '1) Confirm runner category and matched signals',
          '2) If environment-prerequisite, verify xvfb/display and Extension Host bootstrap; if assertion-stage markers are absent, stop there and rerun before any native/fallback discussion',
          '3) If paste-drop-provider-*, compare fallback evidence and provider/capability or DataTransfer signals before touching native-provider assumptions',
          '4) If autocomplete-known-unstable, record separately from paste/drop acceptance and do not reopen provider triage unless provider markers also failed',
          '5) If unknown, inspect runner snapshots before opening a new design thread',
        ],
      })}`,
    );
    throw error;
  }
}
