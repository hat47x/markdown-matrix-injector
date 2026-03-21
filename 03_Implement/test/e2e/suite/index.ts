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
          'If runner classified autocomplete-known-unstable, keep paste/drop provider work isolated. If runner classified paste-drop-provider-*, inspect native provider surface, fallback compatibility, and DataTransfer assertions in extensionHost.test.ts logs.',
      })}`,
    );
    throw error;
  }
}
