export interface ScenarioTemplateCandidate {
  label: string;
  insertText: string;
}

const SCENARIO_TEMPLATE_SECTIONS = ['前提', '手順', '期待結果', '制約'] as const;

export const SCENARIO_OBSERVATION_TEMPLATE = SCENARIO_TEMPLATE_SECTIONS.map((section) => `## ${section}\n`).join('\n');

/** The completion label's wording in the reader language (the inserted `## ${section}` heading is the template contract and stays as-is). */
export interface ScenarioTemplatePhrases {
  candidateLabel(section: string): string;
}

/** The wording a plain (no VS Code host) caller sees: the English reference. */
export const enScenarioTemplatePhrases: ScenarioTemplatePhrases = {
  candidateLabel: (section) => `Observation template: ${section}`,
};

/** The previous Japanese wording, kept verbatim. */
export const jaScenarioTemplatePhrases: ScenarioTemplatePhrases = {
  candidateLabel: (section) => `観測テンプレート: ${section}`,
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function hasSection(documentText: string, section: string): boolean {
  const headingPattern = new RegExp(`^##\\s+${section}\\s*$`, 'm');
  return headingPattern.test(documentText);
}

export function getScenarioTemplateCandidates(
  documentText: string,
  linePrefix: string,
  phrases: ScenarioTemplatePhrases = enScenarioTemplatePhrases,
): ScenarioTemplateCandidate[] {
  const trimmedLinePrefix = linePrefix.trimStart();

  if (!trimmedLinePrefix.startsWith('##')) {
    return [];
  }

  const fragment = normalize(trimmedLinePrefix.replace(/^##\s*/, ''));

  return SCENARIO_TEMPLATE_SECTIONS.filter((section) => !hasSection(documentText, section))
    .filter((section) => normalize(section).includes(fragment))
    .map((section) => ({
      label: phrases.candidateLabel(section),
      insertText: `## ${section}`,
    }));
}
