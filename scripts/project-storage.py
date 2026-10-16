#!/usr/bin/env python3
"""Audit checkout storage; --clean removes bounded, disposable local caches."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]


def allocated(path):
    return int(subprocess.check_output(['du', '-s', '-B1', str(path)]).split()[0]) if path.exists() else 0


def audit(clean=False):
    commands, active_inodes = [], set()
    active_build = False
    for process in Path('/proc').glob('[0-9]*'):
        try:
            commands.append((process / 'cmdline').read_bytes().replace(b'\0', b' ').decode(errors='replace'))
            stat = (process / 'exe').stat()
            active_inodes.add((stat.st_dev, stat.st_ino))
            executable = (process / 'exe').resolve().name
            cwd = (process / 'cwd').resolve()
            if executable in {'cargo', 'rustc'} and (cwd == ROOT or ROOT in cwd.parents or str(ROOT) in commands[-1]):
                active_build = True
        except (PermissionError, FileNotFoundError, ProcessLookupError):
            pass
    if clean and active_build:
        raise RuntimeError('Wait for checkout builds to finish before removing build caches')
    buckets = ['target', 'artifacts', 'web/public', 'web/dist', 'web/node_modules', '.git', '.jj', 'docs', 'packages']
    before = {name: allocated(ROOT / name) for name in buckets}
    candidates = []
    cutoff = time.time() - 24 * 3600
    for directory in ['target/debug/examples', 'target/debug/deps']:
        for path in (ROOT / directory).glob('*'):
            if not re.fullmatch(r'.+-[0-9a-f]{16}', path.name) or not path.is_file():
                continue
            stat = path.stat()
            if stat.st_nlink != 1 or not stat.st_mode & 0o111 or stat.st_mtime >= cutoff:
                continue
            if (stat.st_dev, stat.st_ino) in active_inodes:
                continue
            with path.open('rb') as executable:
                if executable.read(4) != b'\x7fELF':
                    continue
            candidates.append((path, 'Obsolete debug executable, older than 24 hours; current named binaries retained'))
    for directory in ['artifacts/filter-v01/tmp', 'artifacts/oscillator-v02']:
        for path in (ROOT / directory).glob('*'):
            if not path.is_dir() or not re.search(r'profile|chromium|import-browser|^(?:clap|vst3)-creator', path.name):
                continue
            if any(str(path) in command for command in commands):
                continue
            candidates.append((path, 'Inactive, ignored review browser profile'))
    tracked = subprocess.check_output(['jj', 'file', 'list'], cwd=ROOT, text=True).splitlines()
    entries = []
    for path, reason in candidates:
        relative = str(path.relative_to(ROOT))
        if any(name == relative or name.startswith(relative + '/') for name in tracked):
            raise RuntimeError('Refusing tracked path: ' + relative)
        entries.append({'path': relative, 'allocatedBytes': allocated(path), 'reason': reason})
    if clean:
        for path, _ in candidates:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
    after = {name: allocated(ROOT / name) for name in buckets}
    return {'mode': 'clean' if clean else 'audit', 'before': before, 'after': after,
            'reclaimedBytes': sum(before.values()) - sum(after.values()), 'candidates': entries}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--clean', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    report = json.dumps(audit(args.clean), indent=2) + '\n'
    if args.output:
        args.output.write_text(report)
    else:
        print(report, end='')
