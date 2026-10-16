# Checkout storage and bounded cleanup

Audit and cleanup: 2 October 2026. The checkout was about 26 GB. Most space was
compiled Rust output and review scratch data, rather than source growth.

| Area | Before (GiB) | After (GiB) | Explanation |
|---|---:|---:|---|
| Rust `target` | 19.12 | 11.41 | Removed old hashed debug executables; retained current named binaries and release/Wasm builds. |
| Review `artifacts` | 2.89 | 1.27 | Removed inactive ignored review browser profiles; preserved other evidence and working files. |
| Published `web/public` | 1.09 | 1.09 | Downloadable builds, audio and review evidence remain available. |
| Preview `web/dist` | 1.09 | 1.09 | Vite's runnable build includes copies of public delivery assets. |
| Git backing store | 0.64 | 0.64 | No history pruning. |

Approximately **9.33 GiB recovered**. Remaining large areas are debug builds,
release builds and the public/preview asset copies. This does not attribute
unrelated free-space changes elsewhere on the machine to this cleanup.

The [raw cleanup report](https://wubulon.tailfac9f9.ts.net:4174/creative-examples/2026-10-02/storage-cleanup.json)
lists every removed path, reason and measured storage bucket. Nothing outside
this checkout was removed.

## Maintenance

Audit first:

```sh
python scripts/project-storage.py
```

Apply the bounded cache cleanup after builds finish:

```sh
python scripts/project-storage.py --clean --output /tmp/manifold-storage.json
```

The script selects executable ELF files with Cargo hash names older than 24
hours and one filesystem link, and known ignored review-profile directories
without an active process. It protects active executable inodes, refuses tracked
paths and refuses cleanup while this checkout has an active Cargo/Rust build.
Current named probe binaries are retained; deleted obsolete artifacts can be
rebuilt. Published builds, recordings, sources, resources and VCS stores are
outside its removal rules. It audits by default and runs no background cleanup.

The earlier 8.9 GB incremental-cache removal belongs to a prior turn; it is not
counted in the 9.33 GiB recovered here. Full dependency caches and current
incremental state are not automatically removed by this script.
