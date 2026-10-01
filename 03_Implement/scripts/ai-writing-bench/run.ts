/**
 * Prepares and mutates benchmark workspaces (04_Documentation/benchmarks/ai-writing).
 *   run.ts prepare <copy|mmi> <outDir>   workspace: masters/, prompts/T*.md, docs/ (the AI writes docs/T*.md)
 *   run.ts mutate <outDir>               change one source cell in the workspace's masters (follow-up scenario)
 * The same requests go to both arms; only the working method differs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import type { BenchTask } from './score.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const tasksDir = path.join(repoRoot, '04_Documentation/benchmarks/ai-writing/tasks');
const kitMasters = path.join(repoRoot, '04_Documentation/kits/basic-design/masters');
const WORKBOOK = '基本設計.xlsx';

export const MUTATION = { sheet: '権限', key: 'OP-06', column: 2, from: '不可', to: '可' } as const;

export type Arm = 'copy' | 'mmi';

export function promptFor(arm: Arm, request: string, taskId: string, mmiCommand: string): string {
  const common = `${request}\n\n正本は masters/${WORKBOOK} です。正本は編集しないでください。出力は docs/${taskId}.md に書いてください。`;
  if (arm === 'copy') {
    return `${common}\n表はMarkdownの表として本文に書いてください。\n`;
  }
  return `${common}\nMMI.md を読み、その手順に従ってください。表の値は写さず、MMIの参照で載せてください。\n`
    + `mmi コマンド: \`${mmiCommand}\`（検証範囲は --root . を付ける）。mmi check が通るまで直してください。\n`;
}

export function prepare(arm: Arm, outDir: string): string[] {
  const written: string[] = [];
  fs.mkdirSync(path.join(outDir, 'masters'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'prompts'), { recursive: true });
  fs.copyFileSync(path.join(kitMasters, WORKBOOK), path.join(outDir, 'masters', WORKBOOK));
  if (arm === 'mmi') fs.copyFileSync(path.join(repoRoot, 'skills/mmi/SKILL.md'), path.join(outDir, 'MMI.md'));
  const mmiCommand = `node ${path.join(repoRoot, '03_Implement/dist/src/cli/mmi.js')}`;
  for (const file of fs.readdirSync(tasksDir).filter((name) => name.endsWith('.json')).sort()) {
    const task = JSON.parse(fs.readFileSync(path.join(tasksDir, file), 'utf8')) as BenchTask & { request: string };
    const promptPath = path.join(outDir, 'prompts', `${task.id}.md`);
    fs.writeFileSync(promptPath, promptFor(arm, task.request, task.id, mmiCommand));
    written.push(promptPath);
  }
  return written;
}

/** Flip one permission in the workspace's copy of the source of truth. Returns whether a change was made. */
export function mutate(outDir: string): boolean {
  const file = path.join(outDir, 'masters', WORKBOOK);
  const workbook = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  const sheet = workbook.Sheets[MUTATION.sheet];
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    if (sheet[XLSX.utils.encode_cell({ r: row, c: 0 })]?.v !== MUTATION.key) continue;
    const address = XLSX.utils.encode_cell({ r: row, c: MUTATION.column });
    if (sheet[address]?.v !== MUTATION.from) return false;
    sheet[address] = { t: 's', v: MUTATION.to };
    fs.writeFileSync(file, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    return true;
  }
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, a, b] = process.argv.slice(2);
  if (command === 'prepare' && (a === 'copy' || a === 'mmi') && b) {
    console.log(prepare(a, path.resolve(b)).join('\n'));
  } else if (command === 'mutate' && a) {
    console.log(mutate(path.resolve(a)) ? `changed ${MUTATION.sheet} ${MUTATION.key}: ${MUTATION.from} -> ${MUTATION.to}` : 'no change (already mutated?)');
  } else {
    throw new Error('Usage: run.ts prepare <copy|mmi> <outDir> | run.ts mutate <outDir>');
  }
}
