from pathlib import Path
import tempfile
import unittest

from check_plans_layout import check


class PlansLayoutTests(unittest.TestCase):
    def test_current_plan_and_adr_are_allowed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plans = root / '01_Plans'
            (plans / 'adr').mkdir(parents=True)
            (plans / 'README.md').write_text('[計画](work.md)\n', encoding='utf-8')
            (plans / 'work.md').write_text('- 状態: 提案\n- 関連Issue: #1\n- 終了条件: Issueへ反映\n', encoding='utf-8')
            (plans / 'adr' / 'ADR-0001-example.md').touch()
            self.assertEqual(check(root), [])
            # Losing the entry link must make an otherwise valid plan fail.
            (plans / 'README.md').write_text('# 作業\n', encoding='utf-8')
            self.assertIn('README', '\n'.join(check(root)))

    def test_scattered_files_and_missing_lifecycle_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plans = root / '01_Plans'
            (plans / 'research').mkdir(parents=True)
            (plans / 'README.md').write_text('[案](draft.md)', encoding='utf-8')
            (plans / 'draft.md').touch()
            (plans / 'research' / 'notes.md').touch()
            messages = '\n'.join(check(root))
            for expected in ('状態', '関連Issue', '終了条件', 'research'):
                self.assertIn(expected, messages)

    def test_missing_entry_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertTrue(check(Path(directory)))


if __name__ == '__main__':
    unittest.main()
