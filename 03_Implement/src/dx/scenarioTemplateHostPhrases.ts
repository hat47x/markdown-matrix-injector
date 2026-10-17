/**
 * The scenario-template completion's label wording in the bundle's language.
 * The host passes it into the pure builder in `scenarioTemplate.ts`; the
 * inserted headings themselves are the template contract and stay as-is.
 */
import type { ScenarioTemplatePhrases } from './scenarioTemplate.js';
import { uiText } from './uiPhrases.js';

export const hostScenarioTemplatePhrases: ScenarioTemplatePhrases = {
  candidateLabel: (section) => uiText('Observation template: {0}', section),
};
