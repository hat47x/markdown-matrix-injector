import path from 'node:path';

import { loadWorkbook } from '../core/workbookLoader.js';
import { analyzeSheetForImport, type BlockRole, type CautionCode } from './importCandidates.js';
import { readWorkbookStructure } from './workbookStructure.js';

export interface InspectImportAssistanceCandidate {
  sheet: string;
  role: BlockRole;
  range: string;
  reasons: readonly string[];
  proposal?: string;
  cautions: readonly { code: CautionCode; cells?: readonly string[] }[];
}

/**
 * Product-facing projection of the existing import-assistance heuristics.
 *
 * This is deliberately separate from Semantic Candidate authority: roles and
 * proposals are assistance, and a proposal exists only after the normal MMI
 * parser/fallback/logical-table renderer has revalidated it.
 */
export function inspectImportAssistance(
  absolutePath: string,
  fromDocument?: string,
): InspectImportAssistanceCandidate[] {
  const workbook = loadWorkbook({ absolutePath });
  const structure = /\.(xlsx|xlsm)$/iu.test(absolutePath)
    ? readWorkbookStructure(absolutePath, workbook)
    : undefined;
  const base = fromDocument ? path.dirname(path.resolve(fromDocument)) : process.cwd();
  let referencePath = path.relative(base, absolutePath).split(path.sep).join('/');
  if (!referencePath.startsWith('.')) referencePath = `./${referencePath}`;

  return Object.entries(workbook.sheets).flatMap(([sheetName, sheet]) =>
    analyzeSheetForImport(sheetName, sheet, {
      referencePath,
      workbook,
      structure,
      previewRows: 3,
    }).map((candidate) => ({
      sheet: candidate.sheet,
      role: candidate.role,
      range: candidate.a1,
      reasons: candidate.reasons,
      ...(candidate.proposal ? { proposal: candidate.proposal.reference } : {}),
      cautions: candidate.cautions.map((caution) => ({
        code: caution.code,
        ...(caution.cells ? { cells: caution.cells } : {}),
      })),
    })),
  );
}
