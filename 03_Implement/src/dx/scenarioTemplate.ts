export interface ScenarioTemplateCandidate {
  label: string;
  insertText: string;
}

const SCENARIO_TEMPLATE_SECTIONS = ['前提', '手順', '期待結果', '制約'] as const;

export const SCENARIO_OBSERVATION_TEMPLATE = SCENARIO_TEMPLATE_SECTIONS.map((section) => `## ${section}\n`).join('\n');

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function hasSection(documentText: string, section: string): boolean {
  const headingPattern = new RegExp(`^##\\s+${section}\\s*$`, 'm');
  return headingPattern.test(documentText);
}

export function getScenarioTemplateCandidates(documentText: string, linePrefix: string): ScenarioTemplateCandidate[] {
  const trimmedLinePrefix = linePrefix.trimStart();

  if (!trimmedLinePrefix.startsWith('##')) {
    return [];
  }

  const fragment = normalize(trimmedLinePrefix.replace(/^##\s*/, ''));

  return SCENARIO_TEMPLATE_SECTIONS.filter((section) => !hasSection(documentText, section))
    .filter((section) => normalize(section).includes(fragment))
    .map((section) => ({
      label: `観測テンプレート: ${section}`,
      insertText: `## ${section}`,
    }));
}
