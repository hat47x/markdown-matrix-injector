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
        'known-unstable-isolation',
      ],
      triageBoundary: {
        suiteResponsibility: 'Summarize proof boundary and next-step order only; do not infer product decisions from a single failing run.',
        firstTriageOrder: [
          'environment-prerequisite',
          'extension-host-bootstrap',
          'paste-drop-provider-* vs autocomplete-known-unstable vs unknown',
        ],
        environmentPrerequisite: 'Missing DISPLAY/xvfb is categorized before extensionHost.test.ts assertions run.',
        pasteDropBoundary: 'Paste/drop acceptance covers provider surface and fallback compatibility only.',
        knownUnstableIsolation: 'Autocomplete instability is logged separately and should not be used to fail paste/drop acceptance.',
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
          'Suite output is boundary guidance only. Follow runner category first: environment-prerequisite means fix display/xvfb or Extension Host bootstrap before reading assertions; autocomplete-known-unstable means keep paste/drop work isolated; paste-drop-provider-* means compare provider surface, fallback compatibility, and DataTransfer evidence before any native-fallback discussion; unknown means collect logs and stop short of policy debate.',
        nextStepOrder: [
          '1) Confirm runner category and matched signals',
          '2) If environment-prerequisite, restore headless/bootstrap prerequisites and rerun',
          '3) If paste-drop-provider-*, compare fallback evidence before touching native provider assumptions',
          '4) If autocomplete-known-unstable, record separately from paste/drop acceptance',
          '5) If unknown, inspect runner snapshots before opening a new design thread',
        ],
      })}`,
    );
    throw error;
  }
}
