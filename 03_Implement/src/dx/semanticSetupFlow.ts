import * as vscode from 'vscode';

import {
  discoverLocalEmbeddingModels,
  type DiscoveredEmbeddingModel,
} from '../search/semantic/runtimeDiscovery.js';
import { uiText } from './uiPhrases.js';

export const SELECT_LOCAL_SEMANTIC_MODEL_COMMAND_ID =
  'markdownMatrixInjector.selectLocalSemanticModel';

interface SemanticModelQuickPickItem extends vscode.QuickPickItem {
  model: DiscoveredEmbeddingModel;
}

function humanBytes(bytes: number | undefined): string | undefined {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return undefined;
  }
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'] as const;
  let value = bytes / 1024;
  for (const unit of units) {
    if (value < 1024 || unit === units[units.length - 1]) {
      return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
    }
    value /= 1024;
  }
  return undefined;
}

function quickPickItem(
  model: DiscoveredEmbeddingModel,
): SemanticModelQuickPickItem {
  const runtime = model.runtime === 'ollama' ? 'Ollama' : 'LM Studio';
  const size = humanBytes(model.sizeBytes);
  return {
    label: model.displayName,
    description: [runtime, size].filter(Boolean).join(' · '),
    detail: [
      model.model !== model.displayName ? `model: ${model.model}` : '',
      model.artifactDigest ? `digest: ${model.artifactDigest}` : '',
      model.endpoint,
    ].filter(Boolean).join(' · '),
    model,
  };
}

export async function selectLocalSemanticModel(): Promise<boolean> {
  const controller = new AbortController();
  const models = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: uiText('MMI: Looking for on-device embedding models'),
      cancellable: true,
    },
    async (_progress, token) => {
      token.onCancellationRequested(() => controller.abort());
      return discoverLocalEmbeddingModels(fetch, {
        signal: controller.signal,
      });
    },
  );

  if (controller.signal.aborted) {
    return false;
  }
  if (models.length === 0) {
    await vscode.window.showInformationMessage(
      uiText('MMI: No usable local embedding model was found in Ollama / LM Studio. MMI does not fetch or start runtimes and models.'),
    );
    return false;
  }

  const picked = await vscode.window.showQuickPick(
    models.map(quickPickItem),
    {
      title: uiText('MMI: Choose the local semantic-search model'),
      placeHolder:
        uiText('Only the embedding models already on this device are shown'),
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  if (!picked) {
    return false;
  }

  const config = vscode.workspace.getConfiguration(
    'markdownMatrixInjector',
  );
  const target = vscode.ConfigurationTarget.Global;
  await Promise.all([
    config.update('search.semantic.api', picked.model.api, target),
    config.update('search.semantic.endpoint', picked.model.endpoint, target),
    config.update('search.semantic.model', picked.model.model, target),
    config.update(
      'search.semantic.artifactDigest',
      picked.model.artifactDigest ?? '',
      target,
    ),
    config.update('search.semantic.enabled', true, target),
  ]);

  await vscode.window.showInformationMessage(
    uiText('MMI: {0} is now set as the local semantic-search model. {1} No model is downloaded or loaded.',
      picked.model.displayName,
      picked.model.artifactDigest
        ? uiText('the artifact digest is pinned as well.')
        : uiText('the runtime does not expose a digest, so artifact identity cannot be confirmed by name alone.')),
  );
  return true;
}
