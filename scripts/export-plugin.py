#!/usr/bin/env python3
"""Build a portable authored project using the shared Graph CLAP/VST3 shells.

Usage: scripts/export-plugin.py projects/exports/three-tone.json [--no-web-build]
The manifest's ID is permanent: source/version updates preserve DAW identity.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--no-web-build', action='store_true')
    parser.add_argument('--target', help='Rust target; defaults to the current machine')
    parser.add_argument('--output', type=Path, default=ROOT/'target/exports')
    parser.add_argument('--web-dist', type=Path, default=ROOT/'web/dist',
                        help='Offline web assets; the build service supplies an immutable snapshot')
    args = parser.parse_args()
    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text())
    assert manifest['format'] == 'manifold.plugin-export' and manifest['version'] == 1
    name = manifest['name']
    assert name and all(c.isalnum() or c in ' -_' for c in name)
    package_path = (manifest_path.parent/manifest['package']).resolve()
    package = json.loads(package_path.read_text())
    assert package['format'] == 'manifold.package' and package['schemaVersion'] == 1
    assert hashlib.sha256(package['control']['bundle'].encode()).hexdigest() == package['control']['sha256']
    # Views must be supplied by a supported local resolver, never a silent CDN.
    # The source stays in the package; this shell includes its pinned Three.js resolver.
    if not args.no_web_build:
        subprocess.run(['npm', '--prefix', str(ROOT/'web'), 'run', 'build'], check=True)
    host = subprocess.check_output(['rustc','-vV'], text=True).split('host: ')[1].splitlines()[0]
    target = args.target or host
    if target not in ['x86_64-unknown-linux-gnu', 'aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-gnu', 'x86_64-pc-windows-msvc']:
        parser.error('No plug-in bundle layout is implemented for '+target)
    cmd = ['cargo','build','--release','-p','manifold-clap','-p','manifold-vst3']
    linux = 'linux' in target
    if linux: cmd += ['-p','manifold-editor']
    if target != host: cmd += ['--target',target]
    subprocess.run(cmd, cwd=ROOT, env={**os.environ,'MANIFOLD_EXPORT_CONFIG':str(manifest_path)}, check=True)
    build = ROOT/'target'/('release' if target==host else target+'/release')
    out = args.output.resolve()/manifest['id']/target
    out.mkdir(parents=True, exist_ok=True)
    if linux:
        lib_clap, lib_vst = 'libmanifold_clap.so', 'libmanifold_vst3.so'
        module_dir = 'x86_64-linux'; module_name = name+'.so'
        clap_bundle = out/(name+'.clap'); shutil.copyfile(build/lib_clap, clap_bundle)
        editor_dir = out
    elif 'apple' in target:
        lib_clap, lib_vst = 'libmanifold_clap.dylib', 'libmanifold_vst3.dylib'
        module_dir = 'MacOS'; module_name = name
        clap_bundle = out/(name+'.clap'); (clap_bundle/'Contents/MacOS').mkdir(parents=True,exist_ok=True)
        shutil.copyfile(build/lib_clap, clap_bundle/'Contents/MacOS'/name)
        editor_dir = None
    else:
        lib_clap, lib_vst = 'manifold_clap.dll', 'manifold_vst3.dll'
        module_dir = 'x86_64-win'; module_name = name+'.vst3'
        clap_bundle = out/(name+'.clap'); shutil.copyfile(build/lib_clap,clap_bundle)
        editor_dir = None
    vst = out/(name+'.vst3'); binary = vst/'Contents'/module_dir
    binary.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(build/lib_vst, binary/module_name)
    asset_destinations = [out/'assets' if linux or 'apple' not in target else clap_bundle/'Contents/Resources/assets',vst/'Contents/Resources/assets']
    if linux:
        for folder in [editor_dir,binary]:
            shutil.copyfile(build/'manifold-editor',folder/'ManifoldFX-editor'); (folder/'ManifoldFX-editor').chmod(0o755)
    import plistlib
    if 'apple' in target:
        for bundle, extension in [(clap_bundle,'clap'),(vst,'vst3')]:
            info={'CFBundleExecutable':name,'CFBundleIdentifier':manifest['id']+'.'+extension,'CFBundleName':name,'CFBundlePackageType':'BNDL','CFBundleVersion':manifest['pluginVersion'],'CFBundleShortVersionString':manifest['pluginVersion']}
            (bundle/'Contents/Info.plist').write_bytes(plistlib.dumps(info))

    # Keep the native creator's offline module graph, egui Wasm and kit images local.
    for assets in asset_destinations:
        # These directories are assembled output. Drop obsolete hashed chunks
        # so repeated exports do not accumulate old versions of the web app.
        if assets.exists(): shutil.rmtree(assets)
        assets.mkdir(parents=True,exist_ok=True)
        for page in ['filter.html','graph-module.html','fx-module.html','main-looper.html']:
            shutil.copyfile(args.web_dist/page,assets/page)
        for directory in ['assets','ui']:
            shutil.copytree(args.web_dist/directory,assets/directory,dirs_exist_ok=True)
    if 'apple' in target:
        for bundle in [clap_bundle,vst]:
            subprocess.run(['codesign','--force','--sign','-',str(bundle)],check=True)
            subprocess.run(['codesign','--verify','--deep','--strict',str(bundle)],check=True)
    if 'windows-gnu' in target:
        # GNU builds import the Microsoft loader DLL (MSVC uses its static lib).
        registry=Path(os.environ.get('CARGO_HOME',str(Path.home()/'.cargo')))/'registry/src'
        loaders=list(registry.glob('*/webview2-com-sys-0.39.1/x64/WebView2Loader.dll'))
        if len(loaders)!=1: raise RuntimeError('Pinned WebView2Loader.dll not found')
        for folder in [out,binary]: shutil.copyfile(loaders[0],folder/'WebView2Loader.dll')
    shutil.copyfile(package_path,out/'project.manifold.json')
    shutil.copyfile(manifest_path,out/'export.json')
    installation = {
        'linux': 'Keep the .clap file beside assets/ and ManifoldFX-editor. Add this extracted directory to your CLAP search path. Copy the whole .vst3 bundle to ~/.vst3, or add this directory to your VST3 search path. Requires WebKitGTK 4.1.',
        'macos': 'Copy the whole .clap bundle to ~/Library/Audio/Plug-Ins/CLAP and the whole .vst3 bundle to ~/Library/Audio/Plug-Ins/VST3. This is an ARM64 development build with an ad-hoc signature; it has not been notarized. The editor uses the system WKWebView.',
        'windows': 'Keep the .clap file, WebView2Loader.dll and assets/ together in your CLAP search path. Copy the whole .vst3 bundle to your VST3 search path. Install the Microsoft WebView2 Runtime for the custom editor. This GNU build includes its loader DLL.'
    }['linux' if linux else 'macos' if 'apple' in target else 'windows']
    (out/'README.txt').write_text(
        f"{name} {manifest['pluginVersion']}\n{manifest['id']}\n\n{installation}\n\n"
        "Open the plug-in's custom editor to edit the authored graph and Three.js view source. Retained controls, egui controls, the scene and DAW automation share the same graph. Project source and accepted edits travel with DAW state.\n\n"
        "project.manifold.json is the exact authored package; manifest.json records all file hashes. The product ID stays fixed across source updates.\n\n"
        "Rebuild in the Manifold-v2 source checkout:\n"
        f"python scripts/export-plugin.py {manifest_path.relative_to(ROOT) if manifest_path.is_relative_to(ROOT) else manifest_path} --target {target}\n"
        "To export a different instrument, supply its package and permanent identity in a manifold.plugin-export manifest.\n\n"
        "Source: https://github.com/ShamanicArts/manifold\nManifold workspace license: MPL-2.0.\n")
    files={str(path.relative_to(out)):hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(out.rglob('*')) if path.is_file() and path.name!='manifest.json'}
    result={'format':'manifold.plugin-build','version':1,'product':manifest,'target':target,'packageSha256':hashlib.sha256(package_path.read_bytes()).hexdigest(),'files':files,'editorAvailable':True,'requires':{'linux':'WebKitGTK 4.1','macos':'WKWebView','windows':'Microsoft WebView2 Runtime'}['linux' if linux else 'macos' if 'apple' in target else 'windows']}
    (out/'manifest.json').write_text(json.dumps(result,indent=2)+'\n')
    archive=out.parent/(target+'.tar.gz')
    with tarfile.open(archive,'w:gz') as tar:
        tar.add(out,arcname=name)
    print(json.dumps({'directory':str(out),'archive':str(archive),'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest()}))
if __name__ == '__main__': main()
