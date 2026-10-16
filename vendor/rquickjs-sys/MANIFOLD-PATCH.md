# Temporary QuickJS interruption fix

Vendored from the crates.io `rquickjs-sys-0.14.0` archive (SHA-256 `cee271d0eeba64f0915b846cb7ae02e16faf3dfdffdca91731101d9d30fe3423`).
All distributed build inputs are retained. Package-local Cargo.lock,
Cargo.toml.orig and .cargo_vcs_info.json are omitted; the root Cargo.lock owns resolution.

QuickJS-NG 0.16.2's `js_array_find` frees `val` and `index_val` after each
unsuccessful predicate but leaves stale values in those locals. If the next
iteration's interrupt poll fires, the exception path frees them again. This
can corrupt a live object's reference count and crash later cleanup.

The only code change is to reset both locals to `JS_UNDEFINED` after freeing
them. It applies to find, findIndex, findLast and findLastIndex. Interrupts,
script semantics and runtime budgets remain enabled.

Regression: `cargo test -p manifold-project-js --test interrupted_array_search`.
The unchanged dependency segfaults on that test. The diagnostic and sanitizer
evidence are described in `docs/rearchitecture/native-interruption-diagnosis.md`.

Remove the Cargo patch and this directory when an upstream release includes the
fix and the regression passes. Upstream licenses remain in their original files;
the Rust bindings are MIT-licensed (see Cargo.toml), and QuickJS's license is in
quickjs/LICENSE. The root package is not relicensed by vendoring this dependency.
