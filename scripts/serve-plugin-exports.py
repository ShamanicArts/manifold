#!/usr/bin/env python3
"""Private native build worker for the creator's same-origin /__manifold/exports API.

Run behind Vite's loopback proxy. Author source is packaged as data; it is never
executed in Python/Node or interpolated into commands. One build runs at a time.
"""
import argparse
import copy
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import queue
import re
import shlex
import shutil
import signal
import subprocess
import threading
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
PREFIX = '/__manifold/exports'
TARGETS = {
    'linux': ('Linux x86_64', 'x86_64-unknown-linux-gnu'),
    'windows': ('Windows x86_64', 'x86_64-pc-windows-gnu'),
    'macos': ('Mac ARM64', 'aarch64-apple-darwin'),
}


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def validate_submission(value):
    if not isinstance(value, dict):
        raise ValueError('Expected an export request')
    product = value.get('product', {})
    if not isinstance(product, dict):
        raise ValueError('Expected product details')
    rules = {
        'name': r'[A-Za-z0-9][A-Za-z0-9 _-]{0,63}',
        'id': r'[a-z][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*){2,}',
        'vendor': r'[^\x00-\x1f]{1,96}',
        'pluginVersion': r'\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?',
    }
    for key, pattern in rules.items():
        if not isinstance(product.get(key), str) or len(product[key]) > 128 or not re.fullmatch(pattern, product[key]):
            raise ValueError('Invalid product ' + key)
    if product.get('category') not in ['Instrument', 'Fx']:
        raise ValueError('Choose Instrument or Fx')
    if value.get('target') not in TARGETS:
        raise ValueError('Unknown build target')
    if type(value.get('revision')) is not int or value['revision'] < 0:
        raise ValueError('Expected the captured project revision')
    project = value.get('project', {})
    if not isinstance(project, dict) or project.get('format') != 'manifold.live-project' or project.get('version') != 1:
        raise ValueError('Expected an accepted live project')
    if not isinstance(project.get('source'), str) or len(project['source']) > 256_000:
        raise ValueError('Expected project source under 256 KB')
    if not isinstance(project.get('graph'), dict) or project['graph'].get('format') != 'manifold.project':
        raise ValueError('Expected the accepted project graph')
    # No submitted path, command, controller bundle or build option is accepted.
    result = {key: value.get(key) for key in ['target', 'revision', 'project', 'webView']}
    # Studio test graphs are session metadata, never plug-in source/assets.
    result['project'] = copy.deepcopy(project)
    result['project'].pop('studio', None)
    result['project']['graph'].pop('studio', None)
    result['project']['graph'].get('liveAuthoring', {}).pop('studio', None)
    result['product'] = {key: product[key] for key in [*rules, 'category']}
    return result


class Builds:
    def __init__(self, args):
        self.args = args
        self.root = args.jobs.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.jobs = {}
        self.pending = queue.Queue(maxsize=4)
        self.stopping = threading.Event()
        self.child = None
        self.available = {'linux': shutil.which('cargo') is not None,
                          'windows': (args.mingw / 'usr/bin/x86_64-w64-mingw32-gcc').is_file(),
                          'macos': bool(args.mac_host and args.mac_root and args.ssh_key)}
        for status in self.root.glob('*/status.json'):
            job = json.loads(status.read_text())
            self.jobs[job['id']] = job
            if job['status'] in ['queued', 'building']:
                job.update(status='failed', stage='Build interrupted', error='Build service restarted. Export again to retry.')
                self.persist(job)
        self.worker = threading.Thread(target=self.work, daemon=True)
        self.worker.start()

    def persist(self, job):
        path = self.root / job['id'] / 'status.json'
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps(job, indent=2) + '\n')
        temp.replace(path)

    def update(self, job, **fields):
        with self.lock:
            job.update(**fields, updatedAt=time.time())
            self.persist(job)

    def submit(self, value):
        data = validate_submission(value)
        if not self.available[data['target']]:
            raise ValueError('This build target is not configured on the service')
        with self.lock:
            if self.pending.full():
                raise ValueError('The build queue is full. Retry after a build finishes.')
            # Bound retained disk use without silently deleting user downloads.
            retained = sum(p.stat().st_size for p in self.root.rglob('*') if p.is_file())
            if retained > 6 * 1024**3:
                raise ValueError('Export storage is full; the build administrator must free space')
            job_id = str(uuid.uuid4())
            folder = self.root / job_id
            folder.mkdir()
            (folder / 'request.json').write_text(json.dumps(data) + '\n')
            job = {'id': job_id, 'status': 'queued', 'stage': 'Waiting for the build machine',
                   'product': data['product'], 'target': data['target'], 'revision': data['revision'],
                   'createdAt': time.time(), 'updatedAt': time.time()}
            self.jobs[job_id] = job
            self.persist(job)
            self.pending.put(job_id)
            return dict(job)

    def inspect(self, job_id):
        with self.lock:
            job = dict(self.jobs[job_id])
        log = self.root / job_id / 'build.log'
        if log.exists():
            with log.open('rb') as stream:
                stream.seek(max(0, log.stat().st_size - 6000))
                job['log'] = stream.read().decode(errors='replace')
        return job

    def run(self, job, command, *, env=None, input_path=None, timeout=1800):
        log_path = self.root / job['id'] / 'build.log'
        with log_path.open('a') as log:
            log.write('\n' + job['stage'] + '\n')
            log.flush()
            source = input_path.open('rb') if input_path else subprocess.DEVNULL
            try:
                child = subprocess.Popen(command, cwd=ROOT, env=env, stdin=source,
                                         stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                self.child = child
                try:
                    code = child.wait(timeout=timeout)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGTERM)
                    child.wait(timeout=10)
                    raise RuntimeError(job['stage'] + ' exceeded its time limit')
                if code:
                    raise RuntimeError(job['stage'] + ' failed; see the build log')
                if self.stopping.is_set():
                    raise RuntimeError('Build service stopped')
            finally:
                self.child = None
                if input_path:
                    source.close()

    def work(self):
        while not self.stopping.is_set():
            try:
                job_id = self.pending.get(timeout=.5)
            except queue.Empty:
                continue
            job = self.jobs[job_id]
            try:
                self.build(job)
            except Exception as error:
                self.update(job, status='failed', stage='Export failed', error=str(error))
            finally:
                self.pending.task_done()

    def build(self, job):
        folder = self.root / job['id']
        request = json.loads((folder / 'request.json').read_text())
        self.update(job, status='building', stage='Packaging the captured project')
        self.run(job, ['node', str(ROOT / 'scripts/package-live-export.mjs'),
                       str(folder / 'request.json'), str(folder / 'project.manifold.json')])
        self.update(job, stage='Checking native project compatibility')
        self.run(job, ['cargo', 'build', '--release', '-q', '-p', 'manifold-project-js',
                       '--example', 'validate_package'])
        self.run(job, [str(ROOT / 'target/release/examples/validate_package'),
                       str(folder / 'project.manifold.json')], timeout=30)
        manifest = {'format': 'manifold.plugin-export', 'version': 1,
                    **request['product'], 'package': 'project.manifold.json'}
        (folder / 'export.json').write_text(json.dumps(manifest, indent=2) + '\n')
        assets = folder / 'web-dist'
        assets.mkdir()
        # Capture only the offline editor dependency closure, not prior deliveries.
        for page in ['filter.html', 'graph-module.html', 'fx-module.html', 'main-looper.html']:
            shutil.copyfile(ROOT / 'web/dist' / page, assets / page)
        for name in ['assets', 'ui']:
            shutil.copytree(ROOT / 'web/dist' / name, assets / name)
        target = TARGETS[job['target']][1]
        if job['target'] == 'macos':
            archive = self.build_mac(job, folder)
        else:
            env = dict(os.environ)
            env.pop('MANIFOLD_EXPORT_CONFIG', None)
            if job['target'] == 'windows':
                env['PATH'] = str(self.args.mingw / 'usr/bin') + os.pathsep + env['PATH']
                env['CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER'] = 'x86_64-w64-mingw32-gcc'
                env['CC_x86_64_pc_windows_gnu'] = 'x86_64-w64-mingw32-gcc'
                env['AR_x86_64_pc_windows_gnu'] = 'x86_64-w64-mingw32-ar'
            self.update(job, stage='Compiling CLAP and VST3 for ' + TARGETS[job['target']][0])
            self.run(job, ['python3', str(ROOT / 'scripts/export-plugin.py'), str(folder / 'export.json'),
                           '--no-web-build', '--target', target, '--web-dist', str(assets),
                           '--output', str(folder / 'out')], env=env)
            archive = folder / 'out' / manifest['id'] / (target + '.tar.gz')
            shutil.copyfile(archive.parent / target / 'manifest.json', folder / 'manifest.json')
        shutil.copyfile(archive, folder / 'plugin.tar.gz')
        receipt = {'format': 'manifold.browser-export', 'version': 1, 'job': job['id'],
                   'product': job['product'], 'revision': job['revision'], 'target': target,
                   'packageSha256': digest(folder / 'project.manifold.json'),
                   'archiveSha256': digest(folder / 'plugin.tar.gz'),
                   'sourceSha256': hashlib.sha256(request['project']['source'].encode()).hexdigest(),
                   'createdAt': job['createdAt'], 'completedAt': time.time()}
        (folder / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        downloads = {name: PREFIX + '/' + job['id'] + '/' + name for name in
                     ['plugin.tar.gz', 'project.manifold.json', 'manifest.json', 'receipt.json']}
        # Retain the downloads and inputs, not duplicate assembled bundles/cache.
        shutil.rmtree(assets)
        shutil.rmtree(folder / 'out', ignore_errors=True)
        (folder / 'macos.tar.gz').unlink(missing_ok=True)
        self.update(job, status='complete', stage='Ready to download', downloads=downloads,
                    archiveSha256=receipt['archiveSha256'], packageSha256=receipt['packageSha256'])

    def build_mac(self, job, folder):
        # All remote paths/options are deployment configuration or generated UUIDs.
        args = self.args
        remote = args.mac_root.rstrip('/') + '/target/web-export-input/' + job['id']
        ssh = ['ssh', '-i', str(args.ssh_key), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', args.mac_host]
        scp = ['scp', '-q', '-i', str(args.ssh_key), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8']
        self.update(job, stage='Sending the captured project to the Mac build machine')
        self.run(job, ssh + ['mkdir -p ' + shlex.quote(remote)])
        self.run(job, scp + [str(folder / 'export.json'), str(folder / 'project.manifold.json'), args.mac_host + ':' + remote + '/'])
        import tarfile
        packed = folder / 'web-dist.tar.gz'
        with tarfile.open(packed, 'w:gz') as archive:
            archive.add(folder / 'web-dist', arcname='web-dist')
        self.run(job, ssh + ['tar -xz -C ' + shlex.quote(remote)], input_path=packed)
        packed.unlink()
        self.update(job, stage='Compiling CLAP and VST3 on the ARM Mac')
        command = ('cd ' + shlex.quote(args.mac_root) + ' && env PATH=/Users/shamanic/.cargo/bin:/opt/homebrew/bin:/usr/bin:/bin '
                   '/usr/bin/python3 scripts/export-plugin.py ' + shlex.quote(remote + '/export.json')
                   + ' --no-web-build --target aarch64-apple-darwin --web-dist ' + shlex.quote(remote + '/web-dist')
                   + ' --output ' + shlex.quote(remote + '/out'))
        self.run(job, ssh + [command])
        output = remote + '/out/' + job['product']['id']
        self.update(job, stage='Retrieving the Mac archive')
        local = folder / 'macos.tar.gz'
        self.run(job, scp + [args.mac_host + ':' + output + '/aarch64-apple-darwin.tar.gz', str(local)])
        self.run(job, scp + [args.mac_host + ':' + output + '/aarch64-apple-darwin/manifest.json', str(folder / 'manifest.json')])
        # The remote folder is exclusively this completed job's generated scratch.
        self.run(job, ssh + ['rm -rf ' + shlex.quote(remote)])
        return local

    def stop(self):
        self.stopping.set()
        child = self.child
        if child and child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)


class Handler(BaseHTTPRequestHandler):
    def json(self, status, value):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != PREFIX:
            return self.json(404, {'error': 'Unknown export endpoint'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8 * 1024**2:
                return self.json(413, {'error': 'Export snapshot must be under 8 MB'})
            self.connection.settimeout(15)
            value = json.loads(self.rfile.read(length))
            return self.json(202, self.server.builds.submit(value))
        except (ValueError, TypeError) as error:
            return self.json(400, {'error': str(error)})

    def do_GET(self):
        path = self.path.split('?')[0]
        builds = self.server.builds
        if path == PREFIX + '/capabilities':
            return self.json(200, {'targets': [{'id': key, 'label': label, 'available': builds.available[key]}
                               for key, (label, _) in TARGETS.items()],
                               'formats': ['CLAP', 'VST3'], 'developmentBuild': True})
        match = re.fullmatch(re.escape(PREFIX) + r'/([a-f0-9-]{36})(?:/(plugin.tar.gz|project.manifold.json|manifest.json|receipt.json))?', path)
        if not match or match[1] not in builds.jobs:
            return self.json(404, {'error': 'Export job not found'})
        job = builds.inspect(match[1])
        if not match[2]:
            return self.json(200, job)
        if job['status'] != 'complete':
            return self.json(409, {'error': 'This export is not ready to download'})
        file = builds.root / match[1] / match[2]
        self.send_response(200)
        name = job['product']['name'] + '-' + job['target'] + '.tar.gz' if match[2] == 'plugin.tar.gz' else match[2]
        self.send_header('Content-Type', 'application/gzip' if match[2].endswith('.gz') else 'application/json')
        self.send_header('Content-Disposition', 'attachment; filename="' + name + '"')
        self.send_header('Content-Length', str(file.stat().st_size))
        self.send_header('Cache-Control', 'private, no-store')
        self.end_headers()
        with file.open('rb') as source:
            shutil.copyfileobj(source, self.wfile)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4181)
    parser.add_argument('--jobs', type=Path, default=ROOT / 'target/web-exports/jobs')
    parser.add_argument('--mingw', type=Path, default=Path.home() / '.cache/manifold/toolchains/mingw')
    parser.add_argument('--mac-host')
    parser.add_argument('--mac-root')
    parser.add_argument('--ssh-key', type=Path)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.builds = Builds(args)
    def stop(_signum, _frame):
        server.builds.stop()
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print('Manifold export service on 127.0.0.1:' + str(args.port), flush=True)
    try:
        server.serve_forever()
    finally:
        server.builds.stop()
        server.server_close()


if __name__ == '__main__':
    main()
