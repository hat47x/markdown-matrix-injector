#!/usr/bin/env python3
"""Check the placement rules in AGENTS.md without network access."""
from pathlib import Path
import re
import sys


def check(repo_root: Path) -> list[str]:
    plans = repo_root / '01_Plans'
    readme = plans / 'README.md'
    if not readme.is_file():
        return ['01_Plans/README.md がありません']
    index = readme.read_text(encoding='utf-8')
    errors = []
    for path in sorted(plans.rglob('*')):
        if not path.is_file():
            continue
        relative = path.relative_to(plans)
        if relative.parts[0] == 'adr' and len(relative.parts) == 2:
            if path.name == 'TEMPLATE.md' or re.fullmatch(r'ADR-\d{4}-[\w-]+\.md', path.name):
                continue
        elif len(relative.parts) == 1 and path.suffix == '.md':
            if path.name == 'README.md':
                continue
            if not re.search(r'\]\((?:\./)?' + re.escape(path.name) + r'(?:#[^)]*)?\)', index):
                errors.append(f'{relative}: READMEから案内してください')
            text = path.read_text(encoding='utf-8')
            for field in ('状態', '関連Issue', '終了条件'):
                if not re.search(r'^- ' + field + ':', text, re.MULTILINE):
                    errors.append(f'{relative}: {field}を明記してください')
            continue
        errors.append(f'{relative}: AGENTS.mdの用途別の配置先へ移してください')
    return errors


if __name__ == '__main__':
    problems = check(Path(__file__).resolve().parents[2])
    print('\n'.join(problems) if problems else '01_Plansの配置: OK')
    sys.exit(bool(problems))
