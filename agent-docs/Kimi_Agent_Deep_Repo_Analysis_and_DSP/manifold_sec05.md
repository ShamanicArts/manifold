## 5. Build System & Platform Strategy

The Manifold project is built with CMake (minimum version 3.22), matching the threshold that JUCE itself requires for its modern CMake API [^367^]. This alignment is consequential: it grants access to `juce_add_plugin()`, `juce_add_gui_app()`, and the full suite of JUCE module linking targets (`juce::juce_audio_utils`, `juce::juce_dsp`, and so on) that would otherwise be unavailable under older CMake versions. The build script is a single monolithic `CMakeLists.txt` rather than a hierarchical directory structure, which keeps dependency ordering visible but also concentrates complexity in one file. This chapter analyzes three aspects of the build system: the hybrid dependency management strategy, the custom export pipeline, and the platform-specific risks that threaten build reproducibility.

### 5.1 CMake Architecture

#### 5.1.1 Dependency Management Hybrid: Submodules, FetchContent, and System Packages

Manifold sources its ten-plus external dependencies through three distinct mechanisms, each chosen according to the dependency's stability profile, size, and platform availability. Git submodules are used for the largest, most frequently modified libraries: JUCE (from `external/JUCE`), Google Highway (`external/highway`), Dear ImGui (`external/imgui`), and ImGuiColorTextEdit (`external/ImGuiColorTextEdit`). `FetchContent` is used for sol2 (the Lua C++ binding layer, tracking the `develop` branch) and Ableton Link (pinned to tag `Link-3.1.2`). System-level discovery handles Lua 5.4 on Linux via `pkg-config` or `find_package(Lua)`, while Boost::Regex is pulled from the system on desktop but falls back to a vendored header-only copy on Android.

This hybrid approach is pragmatic. Git submodules permit editing dependency source for debugging — a capability that pure `FetchContent` explicitly denies because "it is not possible to edit the source code of the dependency for quick testing purposes" [^383^]. Submodules also remain compatible with Dependabot for automated version bumping, whereas `FetchContent` tags require manual updates because "GitHub's Dependabot will NOT auto-update the GIT_TAG" [^383^]. Conversely, `FetchContent` is preferable for small, stable, header-only libraries such as sol2 and Ableton Link, which carry minimal clone cost and are unlikely to need local patches.

The table below compares each dependency's management method against the alternatives.

| Dependency | Management Method | Pinning Strategy | Rationale |
|:---|:---|:---|:---|
| JUCE | Git submodule (`external/JUCE`) | Manual commit tracking | Large codebase; local patches likely during JUCE version upgrades [^410^] |
| Google Highway | Git submodule (`external/highway`) | Manual commit tracking | SIMD targets may need platform-specific patches |
| Dear ImGui | Git submodule (`external/imgui`) | Manual commit tracking | `thread_local` patch may require source modification [^428^] |
| ImGuiColorTextEdit | Git submodule (`external/ImGuiColorTextEdit`) | Manual commit tracking | Fork (pthom); vendored Boost.Regex headers for Android |
| sol2 | `FetchContent` (GitHub, `develop`) | Branch tracking | Header-only; rapid API changes on `develop` branch [^405^] |
| Ableton Link | `FetchContent` (GitHub, `Link-3.1.2`) | Tag pin | Header-only with CMake Config support; stable release cycle [^415^] |
| Lua 5.4 | System `pkg-config` / `find_package` / source build | `find_package` version check + custom header regex | Linux: system package preferred; Windows/Android: source fallback via `MANIFOLD_BUILD_LUA` |
| Boost::Regex | System `find_package` (desktop); vendored header-only (Android) | System version on desktop; bundled headers on Android | Avoids full Boost on Android where system packages are scarce [^433^] |

Several aspects of this arrangement warrant scrutiny. First, sol2 tracks the `develop` branch without a tag or commit hash, meaning any upstream breaking change to sol2's template metaprogramming surface will propagate directly into Manifold builds. Second, the Lua discovery logic in `CMakeLists.txt` (lines 46–175) implements a three-tier fallback — `pkg-config` → `find_package(Lua 5.4)` → manual `find_path`/`find_library` — that includes a custom `manifold_header_is_lua_54()` function performing regex-based header content inspection. This defensiveness is well-motivated: the authors note that "FindLua can pair the 5.4 library with the unversioned `/usr/include` headers, which breaks sol2 hard." However, the complexity suggests that a single CPM.cmake invocation could replace the entire block with a declarative version pin, as CPM "solves dependency being included twice issues that raw FetchContent can cause" [^362^]. Third, the Boost::Regex split is handled correctly on Android by creating an `INTERFACE IMPORTED` target pointing to vendored headers, which avoids pulling in the full Boost C++ libraries. Boost.Regex now supports standalone mode via `BOOST_REGEX_STANDALONE` [^433^], and Manifold's Android path effectively reproduces this behavior.

#### 5.1.2 Export System: `manifold_add_export_plugin()`

Manifold defines a custom CMake function, `manifold_add_export_plugin()`, which wraps JUCE's `juce_add_plugin()` with project-specific manifest generation. The function accepts arguments for product name, plugin code, project directory, manifest specification, and a `FORMATS` list (defaulting to `Standalone VST3`). It then invokes a Python script (`tools/generate_export_manifest.py`) to synthesize a JSON5 manifest file from a `.spec.json` input, registers the manifest generation as a custom CMake command with proper dependency tracking, and links the generated manifest into the plugin target via `MANIFOLD_DEFAULT_PROJECT`.

This design decouples plugin metadata from the C++ source tree. A developer wishing to ship a derivative product — say, a standalone filter plugin — provides only a project directory and a manifest specification; the build system handles JUCE target creation, source aggregation, and compile-definition injection. Nine exported products are already defined in the main `CMakeLists.txt` (lines 793–855), ranging from `Manifold_Filter` (a standalone filter) to `Manifold_Sample` (a synth with MIDI input and sidechain). Each inherits the full DSP and runtime source lists, meaning every export compiles the entire Manifold node library regardless of which nodes the specific product uses. This is a compile-time cost in exchange for simplicity; more granular source selection would require a dependency-graph analysis of which `PrimitiveNode` types each export references.

The manifest generation step introduces a Python runtime dependency during configuration, gated by `find_package(Python3 REQUIRED COMPONENTS Interpreter)` at line 10. This is standard practice — Pamplejuce similarly uses Python for versioning tasks [^410^] — but it adds a toolchain requirement that must be documented for contributors.

#### 5.1.3 Cross-Platform Coverage

Manifold targets four platforms: Linux (GCC and Clang), Windows (MSVC and clang-cl), Android (NDK via `juce_add_gui_app`), and iOS (partial, detected via `CMAKE_SYSTEM_NAME STREQUAL "iOS"`). The compiler coverage is broad by audio-plugin standards. JUCE's CMake API itself supports these platforms, with the caveat that iOS "requires CMake 3.14 or higher" and "the Xcode generator is highly recommended" [^431^]. Android builds are coordinated through the NDK build system with CMake as the native build backend [^417^].

The table below maps each platform to its build configuration, supported plugin formats, and identified risks.

| Platform | Generator / Toolchain | Supported Formats | Compiler | Known Risks |
|:---|:---|:---|:---|:---|
| Linux (x86_64) | Unix Makefiles or Ninja | VST3, Standalone | GCC, Clang | Highway SIMD enabled for x86 only; ARM64 Linux not configured |
| Windows (x86_64) | Visual Studio or Ninja | VST3, Standalone | MSVC, clang-cl | `MANIFOLD_BUILD_LUA` required; no system Lua |
| Android | Gradle + NDK + CMake | Standalone app (GUI) | Android NDK Clang | `dlsym()` visibility for `juce_CreateApplication()` may need patch [^414^]; ARM builds fall back to scalar Highway |
| iOS | Xcode (recommended) | Partial | Apple Clang | `CMAKE_SYSTEM_NAME=iOS` detected but build flags not fully configured; static library output unsupported by JUCE CMake API [^406^] |
| macOS (implied by JUCE) | Xcode or Ninja | Not explicitly listed | Apple Clang | Code signing / notarization pipeline absent [^371^] |

The most significant gap in this matrix is the absence of CLAP format support. CLAP (CLever Audio Plug-in) is an open plugin format gaining rapid adoption in Bitwig Studio, Reaper, and the free-audio ecosystem. Its build integration is lightweight: "Ideally a clap plugin should be self contained: it should not rely upon symbols from the host, and it should export only one symbol: clap_entry" [^396^]. The `clap-juce-extensions` project provides a single CMake module that adds CLAP to any JUCE plugin with one additional `juce_add_plugin` argument [^388^]. Manifold's export system could adopt this with minimal changes to `manifold_add_export_plugin()`. Similarly, AU (Audio Unit) support is missing despite being the native format on macOS; JUCE's CMake API supports AU via the `FORMATS` list [^431^], but Manifold restricts exports to `VST3 Standalone` only.

Another issue, discussed in Chapter 3's Insight 3, is that Manifold configures Google Highway for x86 SIMD targets (SSE2/3/4) but does not enumerate ARM targets (`HWY_NEON`, `HWY_NEON_BF16`, `HWY_SVE`, `HWY_SVE2`) [^1^]. Because Android and iOS are both ARM-dominant platforms, this means mobile builds will execute scalar fallbacks for all Highway-optimized nodes (e.g., `ADSREnvelopeNode_Highway`, `BitCrusherNode_Highway`), effectively nullifying the SIMD investment on the platforms where performance is most constrained. This is a build-system-only fix: the portable Highway abstractions (`SlideUpLanes`, `BroadcastLane`) require zero source changes to compile for ARM [^20^].

### 5.2 CI/CD and Tooling Gaps

#### 5.2.1 No GitHub Actions CI Pipeline Detected

Despite `enable_testing()` at line 1141 and seven `add_test()` registrations (headless IPC core, headless IPC editor, standalone direct regression, standalone direct profile sanity, port buffer semantics, plus two harness binaries), there is no evidence of a GitHub Actions (or equivalent) continuous integration pipeline in the repository. This is a structural vulnerability. Pamplejuce, the most influential open-source JUCE template, provides "Building and testing cross-platform (linux, macOS, Windows) binaries" and "Running pluginval 1.x against the binaries for plugin validation" as standard CI steps [^410^]. JUCE-Plugin-Starter similarly builds AU, VST3, CLAP, and Standalone across three platforms with automated platform detection [^359^]. Audio Modeling, a commercial audio software vendor, describes their CI pipeline as creating "a new and clean virtual container and then proceeds in compiling the code" on every commit [^367^].

Without CI, cross-platform regressions in `manifold_add_export_plugin()` or the platform-detection logic (lines 565–571) will only surface when a developer manually builds on the affected platform. Given that iOS support is already labeled "partial," this lack of automated verification means iOS breakages may go undetected until a release candidate stage.

#### 5.2.2 Missing sccache, PluginVal, and Ninja Standardization

The build system does not reference Mozilla sccache, the Ninja generator, or Tracktion's PluginVal validation tool — all of which have become standard in modern JUCE CMake templates. sccache "will shave minutes off your build times" by caching compiled object files across CI runs [^372^]; Pamplejuce reports that "first builds take 5-10 minutes per platform; subsequent builds with minor changes are significantly faster" when sccache is enabled [^359^]. Ninja is the preferred generator across all platforms for consistent, fast builds [^359^] [^403^]. PluginVal is the de facto plugin-format compliance validator; it scans for real-time safety violations (e.g., mutex locks in the audio callback) that static analysis cannot catch [^410^].

Manifold's test suite is entirely Python-driven (e2e IPC tests, standalone regression tests, UI profile tests) and focuses on functional correctness rather than plugin-format compliance. Adding PluginVal to the existing `add_test()` framework would require only a binary download step and a single command-line invocation per built artifact.

#### 5.2.3 No CLAP Format Support Despite Industry Adoption

As noted in Section 5.1.3, Manifold's `FORMATS` default is `Standalone VST3`. In October 2025, Steinberg relicensed the VST3 SDK under the MIT license, removing the previous proprietary constraint [^367^]. While this reduces the legal urgency to migrate away from VST3, it does not diminish the technical appeal of CLAP, which offers per-note modulation, a lighter host contract, and growing DAW support. The `JUCE-Plugin-Starter` template supports CLAP alongside AU, AUv3, VST3, and Standalone [^359^]. Adding CLAP to Manifold would expand DAW compatibility at low implementation cost.

### 5.3 Platform-Specific Risks

#### 5.3.1 ImGui `thread_local` Patch: Mandatory for Multi-Instance Safety

Dear ImGui stores its global context in a single `ImGuiContext* GImGui` pointer. In a DAW where multiple plugin instances may be instantiated simultaneously, this global state causes crashes unless the pointer is made `thread_local` [^428^]. The imgui_juce integration library documents this explicitly: "By default ImGui only support a single instance running because it uses a global state... You need to patch ImGui and make the global state thread local." [^428^]

Manifold's `CMakeLists.txt` builds ImGui as a static library with a custom `ManifoldImGuiConfig.h` and includes `manifold/ui/imgui/ManifoldImGuiGlobals.cpp` in the source list (line 205). The presence of a dedicated globals file suggests the authors are aware of ImGui's state management, but the `thread_local` status of `GImGui` cannot be confirmed from CMake alone. This must be verified by inspecting `ManifoldImGuiGlobals.cpp` or the `IMGUI_USER_CONFIG` header. If the patch is absent, opening two Manifold VST3 instances in the same DAW session will trigger undefined behavior.

#### 5.3.2 Android `dlsym()` Visibility: Potential JUCE 8 Compatibility Issue

JUCE Android builds historically suffered from a symbol visibility problem: all JUCE modules are linked with `PRIVATE` scope, which on Android is equivalent to `-fvisibility=hidden`. The entry point `juce_CreateApplication()` is therefore invisible to `dlsym()`, preventing the Java-native bridge from loading the application [^414^]. The fix is a one-line visibility patch. It is unclear whether this is resolved in JUCE 8 or whether Manifold's Android build applies the workaround. Manifold's Android target (lines 886–958) forces `MANIFOLD_BUILD_LUA=ON` and configures asset bundling, but does not contain any visibility-related compiler flags. This should be tested on a current Android NDK (version 25+ recommended [^384^]).

#### 5.3.3 Boost::Regex Dependency: Standalone vs. Full Boost

ImGuiColorTextEdit requires regular expression support. On desktop platforms, Manifold's `CMakeLists.txt` calls `find_package(Boost REQUIRED COMPONENTS regex)` (line 244). On Android, it creates an `INTERFACE IMPORTED` target pointing to `vendor/regex/include` within the ImGuiColorTextEdit directory (lines 240–242). This split is architecturally sound: it avoids a full Boost installation on Android while reusing the system package on Linux and Windows.

However, the desktop path still depends on the system Boost distribution. Boost.Regex is now header-only and can operate in "standalone mode without the rest of the Boost C++ libraries" by defining `BOOST_REGEX_STANDALONE` [^433^]. If Manifold's ImGuiColorTextEdit fork supports this mode, the desktop build could also eliminate the system Boost dependency, reducing both CI image size and contributor onboarding friction. This is a low-effort, medium-impact change: adding `-DBOOST_REGEX_STANDALONE` to the `imgui_color_text_edit` target compile definitions would be sufficient, provided the vendored headers are also available on desktop.

Taken together, these three risks — ImGui instance safety, Android symbol visibility, and Boost dependency weight — are all build-system-adjacent issues that do not require algorithmic changes. They represent what Insight 7 (Section 1, Chapter Overview) classifies as "build-system-only" fixes with low risk profiles, suitable for Phase 1 of a modernization sequence before any C++ source-level or SIMD-target changes are attempted.
