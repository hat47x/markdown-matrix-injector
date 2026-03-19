import { runIntegrationTests } from './extensionHost.test.js';

export async function run(): Promise<void> {
  await runIntegrationTests();
}
