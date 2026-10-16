use std::{env, fs, path::PathBuf, process::Command};

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows")
        || env::var("CARGO_CFG_TARGET_ENV").as_deref() != Ok("gnu")
    {
        return;
    }
    // The plug-in's DSP must load before its optional browser runtime. Use a
    // delayed import, then explicitly preload the adjacent loader on UI attach.
    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let definition = out.join("webview2.def");
    fs::write(&definition, "LIBRARY WebView2Loader.dll\nEXPORTS\nCompareBrowserVersions\nCreateCoreWebView2Environment\nCreateCoreWebView2EnvironmentWithOptions\nGetAvailableCoreWebView2BrowserVersionString\nGetAvailableCoreWebView2BrowserVersionStringWithOptions\n").unwrap();
    let tool = match env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
        "x86_64" => "x86_64-w64-mingw32-dlltool",
        "x86" => "i686-w64-mingw32-dlltool",
        architecture => panic!("GNU WebView2 delay loading unsupported for {architecture}"),
    };
    let status = Command::new(tool)
        .arg("--input-def")
        .arg(definition)
        .arg("--output-delaylib")
        .arg(out.join("libWebView2Loader.dll.a"))
        .status()
        .expect("MinGW dlltool is required for Windows GNU exports");
    assert!(status.success(), "WebView2 delay import generation failed");
    println!("cargo:rustc-link-search=native={}", out.display());
}
