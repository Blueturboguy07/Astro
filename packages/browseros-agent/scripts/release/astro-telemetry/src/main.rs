//! astro-telemetry-shim: the launcher at the path of Astro's local server.
//!
//! Astro is a re-cut of a prebuilt browser (RELEASING.md). The only native program that the
//! browser starts by itself is the local server:
//! `BrowserOSServer/default/resources/bin/browseros_server`. This launcher takes that file name.
//! The real server moves to `browseros_server_real` in the same folder. Its bytes do not change.
//!
//! - macOS and Linux: the launcher starts one more copy of itself as the usage-count sidecar. Then
//!   it calls exec() with the real server. The server keeps the process ID that the browser watches
//!   and stops. The sidecar ends when that process ID goes away.
//! - Windows: the launcher runs the real server as a child process in a kill-on-close job. It waits
//!   for the server and returns the exit code of the server. When the browser stops the launcher,
//!   Windows closes the job and stops the server.
//!
//! The usage counts are publik telemetry v1 (publik_telemetry.rs): `app_opened` one time, then
//! `active_session` every 30 minutes. No content is sent. Turn it off with DO_NOT_TRACK=1.
//! Docs: https://publikhq.com/skills/telemetry.md

mod publik_telemetry;

use std::ffi::OsString;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

/// The publik listing slug.
const SLUG: &str = "astro";
/// The Astro release version: `version` in Cargo.toml. Change it for each Astro release.
const VERSION: &str = env!("CARGO_PKG_VERSION");
/// astro-telemetry-shim.ts finds a launcher by this text. Do not change it.
const MARKER: &str = "astro-telemetry-shim/1";
const REAL_SERVER: &str = if cfg!(windows) { "browseros_server_real.exe" } else { "browseros_server_real" };

/// The real server: the file `browseros_server_real` in the folder of this launcher.
fn real_server() -> PathBuf {
    let launcher = std::env::current_exe().ok().or_else(|| std::env::args_os().next().map(PathBuf::from));
    launcher.unwrap_or_default().with_file_name(REAL_SERVER)
}

fn cannot_start(real: &std::path::Path, error: &std::io::Error) -> ! {
    let _ = writeln!(std::io::stderr(), "{}: cannot start {}: {}", MARKER, real.display(), error);
    std::process::exit(1) // 1 = general error: the browser starts the server again
}

/// The publik key that Astro holds, or nothing when the user is not connected to publik API.
/// The extension saves it as the "publik API" connection in the config.json of the answer engine
/// (apps/app/lib/publik/provision.ts). Only that connection is read. A key of a different provider
/// in the same file is never returned.
fn publik_key() -> Option<String> {
    let var = |name: &str| std::env::var_os(name).filter(|value| !value.is_empty()).map(PathBuf::from);
    // The folder rule of the server: DATA_DIR/data, or else <BROWSEROS_DIR or ~/.browseros>/simplicity.
    let folder = match var("DATA_DIR") {
        Some(data) => data.join("data"),
        None => var("BROWSEROS_DIR").or_else(|| var("HOME").or_else(|| var("USERPROFILE")).map(|home| home.join(".browseros")))?.join("simplicity"),
    };
    let file = folder.join("config.json");
    if std::fs::metadata(&file).ok()?.len() > 4 * 1024 * 1024 {
        return None;
    }
    let config: serde_json::Value = serde_json::from_slice(&std::fs::read(&file).ok()?).ok()?;
    config.get("modelProviders")?.as_array()?.iter().find_map(|provider| {
        let settings = provider.get("config")?;
        let named = provider.get("name").and_then(|name| name.as_str()) == Some("publik API");
        let hosted = settings.get("baseURL").and_then(|url| url.as_str()).map(is_publik_host).unwrap_or(false);
        let key = settings.get("apiKey")?.as_str()?;
        ((named || hosted) && (key.starts_with("pk_live_") || key.starts_with("pk_test_"))).then(|| key.to_string())
    })
}

fn is_publik_host(url: &str) -> bool {
    let rest = url.strip_prefix("https://").unwrap_or("");
    let host = rest.split(|c| matches!(c, '/' | ':' | '?' | '#')).next().unwrap_or("").to_ascii_lowercase();
    host == "publikhq.com" || host.ends_with(".publikhq.com")
}

#[cfg(unix)]
fn main() {
    use std::os::unix::process::{parent_id, CommandExt};
    use std::process::Stdio;
    const SIDECAR: &str = "--publik-telemetry-sidecar";

    let mut args = std::env::args_os().skip(1).peekable();
    if args.peek().map(|first| first == SIDECAR).unwrap_or(false) {
        // The sidecar. Its parent is the server. It sends the usage counts while the server runs.
        let server: u32 = args.nth(1).and_then(|pid| pid.to_str().and_then(|text| text.parse().ok())).unwrap_or(0);
        publik_telemetry::start(SLUG, VERSION, Some(Box::new(publik_key)));
        while server > 1 && parent_id() == server {
            std::thread::sleep(std::time::Duration::from_secs(3));
        }
        return;
    }
    let args: Vec<OsString> = args.collect();
    let real = real_server();
    // A sidecar that does not start must not stop the server: the result is ignored.
    if let (true, Ok(launcher)) = (real.is_file(), std::env::current_exe()) {
        let mut sidecar = Command::new(launcher);
        sidecar.arg(SIDECAR).arg(std::process::id().to_string()).current_dir("/").stdin(Stdio::null()).stdout(Stdio::null());
        let _ = sidecar.spawn();
    }
    let error = Command::new(&real).args(&args).exec(); // exec() returns only when it fails
    cannot_start(&real, &error)
}

#[cfg(windows)]
fn main() {
    use std::os::windows::io::AsRawHandle;
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000; // the browser starts the server with no console window

    let args: Vec<OsString> = std::env::args_os().skip(1).collect();
    let real = real_server();
    let mut server = match Command::new(&real).args(&args).creation_flags(CREATE_NO_WINDOW).spawn() {
        Ok(server) => server,
        Err(error) => cannot_start(&real, &error),
    };
    stop_with_this_process(server.as_raw_handle() as *mut core::ffi::c_void);
    publik_telemetry::start(SLUG, VERSION, Some(Box::new(publik_key)));
    let code = server.wait().ok().and_then(|status| status.code()).unwrap_or(1);
    std::process::exit(code)
}

/// Puts the server in a job that Windows closes when this launcher ends, for any reason. Then the
/// server ends too, as it did when the browser stopped the server process itself. Processes that the
/// server starts do not join the job (silent breakaway): they keep the life they had before.
#[cfg(windows)]
fn stop_with_this_process(server: *mut core::ffi::c_void) {
    use core::ffi::c_void;
    #[repr(C)]
    #[allow(dead_code)] // Windows reads the fields
    struct BasicLimits {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }
    #[repr(C)]
    #[allow(dead_code)]
    struct ExtendedLimits {
        basic: BasicLimits,
        io_counters: [u64; 6],
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }
    const JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK: u32 = 0x1000;
    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;
    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: i32 = 9;
    #[link(name = "kernel32")]
    extern "system" {
        fn CreateJobObjectW(attributes: *const c_void, name: *const u16) -> *mut c_void;
        fn SetInformationJobObject(job: *mut c_void, class: i32, information: *const c_void, length: u32) -> i32;
        fn AssignProcessToJobObject(job: *mut c_void, process: *mut c_void) -> i32;
    }
    // SAFETY: plain Win32 calls with a zeroed, correctly sized structure. The job handle stays open
    // on purpose: Windows closes it when this process ends, and that is the signal to stop the server.
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return;
        }
        let mut limits: ExtendedLimits = std::mem::zeroed();
        limits.basic.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK;
        let size = std::mem::size_of::<ExtendedLimits>() as u32;
        if SetInformationJobObject(job, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, &limits as *const ExtendedLimits as *const c_void, size) != 0 {
            AssignProcessToJobObject(job, server);
        }
    }
}
