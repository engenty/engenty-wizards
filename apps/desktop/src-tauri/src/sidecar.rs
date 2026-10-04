//! The runtime this app shows on this machine: the install in `~/.engenty/wizards`, shared with
//! the `engenty-wizards` command. The app brings no runtime along. It installs one with the
//! installer it carries (`wizards.sh`) when there is none or an older one, starts it on a
//! loopback port and stops it when it quits. A runtime the command line already started on the
//! same data folder is shown instead of starting a second one.

use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use serde::Deserialize;
use tauri::{AppHandle, Manager, Url};

use crate::{
    environment, log,
    state::{Phase, Shell, Sidecar},
    window,
};

const START_TIMEOUT: Duration = Duration::from_secs(60);
/// The npm package the installer puts into `runtime/`.
const PACKAGE: &str = "engenty-wizards";
/// Lines of the installer the window shows while it runs.
const PROGRESS_LINES: usize = 12;

/// `~/.engenty/wizards`; `ENGENTY_HOME` moves it, as it does for the command line.
pub fn home_dir(app: &AppHandle) -> PathBuf {
    let base = std::env::var("ENGENTY_HOME")
        .ok()
        .filter(|dir| !dir.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| app.path().home_dir().ok().map(|home| home.join(".engenty")))
        .unwrap_or_else(|| std::env::temp_dir().join("engenty"));
    base.join("wizards")
}

/// Where the runtime keeps its databases, files and its secret: `data/` of the install. Data an
/// earlier version of the app kept in its own support folder moves there once.
pub fn data_dir(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = std::env::var("ENGENTY_WIZARDS_DATA_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    let data = home_dir(app).join("data");
    if data.exists() {
        return data;
    }
    let Some(old) = app
        .path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("data"))
        .filter(|dir| dir.is_dir())
    else {
        return data;
    };
    let _ = std::fs::create_dir_all(home_dir(app));
    match std::fs::rename(&old, &data) {
        Ok(()) => {
            log::line(
                app,
                format!("data moved: {} -> {}", old.display(), data.display()),
            );
            data
        }
        Err(error) => {
            log::line(app, format!("data stays in {}: {error}", old.display()));
            old
        }
    }
}

/// An installed runtime: the package and the Node that runs it.
struct Install {
    root: PathBuf,
    node: PathBuf,
}

impl Install {
    fn entry(&self) -> PathBuf {
        self.root
            .join("apps")
            .join("runtime")
            .join("dist")
            .join("index.js")
    }

    fn command(&self) -> PathBuf {
        self.root.join("bin").join("engenty-wizards.mjs")
    }

    fn version(&self) -> Option<String> {
        #[derive(Deserialize)]
        struct Manifest {
            version: String,
        }
        let text = std::fs::read_to_string(self.root.join("package.json")).ok()?;
        serde_json::from_str::<Manifest>(&text)
            .ok()
            .map(|manifest| manifest.version)
    }
}

/// Development: `ENGENTY_WIZARDS_RUNTIME` names a checkout (or any folder with the package's
/// layout) to run instead of the install; the app then installs and updates nothing.
fn development_runtime() -> Option<PathBuf> {
    std::env::var("ENGENTY_WIZARDS_RUNTIME")
        .ok()
        .filter(|dir| !dir.trim().is_empty())
        .map(PathBuf::from)
}

fn find_install(app: &AppHandle) -> Option<Install> {
    let home = home_dir(app);
    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    let install = match development_runtime() {
        Some(root) => Install {
            root,
            node: std::env::var("ENGENTY_WIZARDS_NODE")
                .ok()
                .map(PathBuf::from)
                .or_else(|| {
                    std::env::split_paths(&environment::login_path())
                        .map(|dir| dir.join(node_name))
                        .find(|node| node.exists())
                })?,
        },
        None => Install {
            root: home.join("runtime").join("node_modules").join(PACKAGE),
            node: home.join("tools").join("node").join("bin").join(node_name),
        },
    };
    (install.entry().exists() && install.node.exists()).then_some(install)
}

/// `1.2.3` (anything after the third number is ignored) as numbers to compare.
fn version_numbers(version: &str) -> (u64, u64, u64) {
    let mut numbers = version
        .split(['.', '-', '+'])
        .map(|part| part.parse().unwrap_or(0));
    (
        numbers.next().unwrap_or(0),
        numbers.next().unwrap_or(0),
        numbers.next().unwrap_or(0),
    )
}

fn current(app: &AppHandle, generation: u64) -> bool {
    let shell = app.state::<Shell>();
    let inner = shell.inner.lock().unwrap();
    inner.generation == generation && !inner.quitting
}

/// What the runtime and the installer get on their PATH: AI clients the setup installed, the
/// install's own Node (a client from npm is a script that asks for `node`), then the login shell's.
fn path_with(app: &AppHandle, node: Option<&PathBuf>) -> String {
    let mut entries = vec![home_dir(app).join("clients").join("bin")];
    if let Some(dir) = node.and_then(|node| node.parent()) {
        entries.push(dir.to_path_buf());
    }
    entries.extend(std::env::split_paths(&environment::login_path()));
    std::env::join_paths(entries)
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|_| environment::login_path())
}

/// Variables of the app that reach the installer and the command, besides the usual ones.
const PASSED_ON: &[&str] = &[
    "ENGENTY_HOME",
    "ENGENTY_WIZARDS_PACKAGE",
    "ENGENTY_WIZARDS_NODE_VERSION",
    "ENGENTY_WIZARDS_NO_LINK",
];

fn passed_on() -> Vec<(String, String)> {
    PASSED_ON
        .iter()
        .filter_map(|key| {
            std::env::var(key)
                .ok()
                .map(|value| (key.to_string(), value))
        })
        .collect()
}

/// Runs the installer the app carries: its own Node, the runtime at the app's version and the
/// command, without questions. What it prints is shown in the window.
fn install(app: &AppHandle, generation: u64) -> Result<(), String> {
    let script = app
        .path()
        .resource_dir()
        .map_err(|e| format!("no resource folder: {e}"))?
        .join("wizards.sh");
    if !script.exists() {
        return Err(format!(
            "The installer is not in the app ({}).",
            script.display()
        ));
    }
    let version = app.package_info().version.to_string();
    {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        if inner.generation != generation || inner.quitting {
            return Err("cancelled".into());
        }
        inner.phase = Phase::Installing;
        inner.progress.clear();
    }
    window::show_shell(app);
    log::line(app, format!("installing the runtime {version}"));

    let mut command = Command::new("/bin/bash");
    command
        .arg(&script)
        .args(["--no-setup", "--version", &version])
        .env_clear()
        .envs(environment::inherited())
        .envs(passed_on())
        .env("PATH", environment::login_path())
        .env("TERM", "dumb")
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        // Its own process group: stopping it also stops the download and npm.
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command.spawn().map_err(|e| format!("bash: {e}"))?;
    let outputs: Vec<Box<dyn Read + Send>> = vec![
        Box::new(child.stdout.take().ok_or("no installer output")?),
        Box::new(child.stderr.take().ok_or("no installer output")?),
    ];
    let child = Arc::new(Mutex::new(child));
    app.state::<Shell>().inner.lock().unwrap().installer = Some(child.clone());

    let readers: Vec<_> = outputs
        .into_iter()
        .map(|output| {
            let app = app.clone();
            thread::spawn(move || {
                for line in BufReader::new(output).lines().map_while(Result::ok) {
                    // The gutter of the installer's own look says nothing here.
                    let text =
                        line.trim_matches(|c: char| c.is_whitespace() || "│┌└◇■".contains(c));
                    if text.is_empty() {
                        continue;
                    }
                    log::line(&app, format!("installer: {text}"));
                    let shell = app.state::<Shell>();
                    let mut inner = shell.inner.lock().unwrap();
                    inner.progress.push(text.to_string());
                    let extra = inner.progress.len().saturating_sub(PROGRESS_LINES);
                    inner.progress.drain(..extra);
                }
            })
        })
        .collect();
    let status = loop {
        if let Ok(Some(status)) = child.lock().unwrap().try_wait() {
            break status;
        }
        thread::sleep(Duration::from_millis(100));
    };
    for reader in readers {
        let _ = reader.join();
    }
    app.state::<Shell>().inner.lock().unwrap().installer = None;
    if !current(app, generation) {
        return Err("cancelled".into());
    }
    if status.success() {
        Ok(())
    } else {
        Err(format!("The installer failed ({status})."))
    }
}

/// The installed runtime, installed or updated first when it is missing or older than the app.
fn ensure_install(app: &AppHandle, generation: u64) -> Result<Install, String> {
    let wanted = version_numbers(&app.package_info().version.to_string());
    let found = find_install(app);
    if development_runtime().is_some() {
        return found.ok_or_else(|| {
            "ENGENTY_WIZARDS_RUNTIME names no built runtime (apps/runtime/dist/index.js), or no node was found.".into()
        });
    }
    let current_enough = found
        .as_ref()
        .and_then(Install::version)
        .is_some_and(|version| version_numbers(&version) >= wanted);
    if let (Some(install), true) = (found, current_enough) {
        return Ok(install);
    }
    install(app, generation)?;
    find_install(app).ok_or_else(|| "The installer ran, but the runtime is not there.".to_string())
}

/// The port the command line starts the runtime on, too: links into the local runtime (a
/// published wizard opened in the browser, a bookmark, an AI client's MCP address) find it there,
/// whichever of the two started it.
const PORT: u16 = 24368;

/// A free loopback port: 24368, else the one of the last start when it is still free, so that
/// links outlive a restart, else any.
fn free_port(app: &AppHandle) -> std::io::Result<u16> {
    let file = data_dir(app).join("desktop.port");
    let last = std::fs::read_to_string(&file)
        .ok()
        .and_then(|text| text.trim().parse::<u16>().ok());
    for port in [Some(PORT), last].into_iter().flatten() {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }
    let port = TcpListener::bind(("127.0.0.1", 0))?.local_addr()?.port();
    let _ = std::fs::create_dir_all(data_dir(app));
    let _ = std::fs::write(file, port.to_string());
    Ok(port)
}

/// The one-time key of this start: 24 random bytes, hex.
fn access_key() -> Result<String, String> {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).map_err(|e| format!("no random bytes: {e}"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn healthy(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(300)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let request =
        format!("GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    response.starts_with("HTTP/1.1 200") && response.contains("\"ok\":true")
}

/// The note a running runtime leaves in its data folder (`running.json`).
#[derive(Deserialize)]
struct Running {
    pid: i32,
    port: u16,
    url: String,
}

/// A runtime somebody else started on this data folder (the command line) and that answers.
fn running_elsewhere(app: &AppHandle) -> Option<Running> {
    let text = std::fs::read_to_string(data_dir(app).join("running.json")).ok()?;
    let running: Running = serde_json::from_str(&text).ok()?;
    #[cfg(unix)]
    {
        if unsafe { libc::kill(running.pid, 0) } != 0 {
            return None;
        }
    }
    healthy(running.port).then_some(running)
}

/// A link that lets the window into a runtime that already runs: `engenty-wizards open --print`
/// signs a ticket with the data folder's secret.
fn entry_link(app: &AppHandle, install: &Install, running: &Running) -> Option<String> {
    let output = Command::new(&install.node)
        .arg(install.command())
        .args(["open", "--print"])
        .env_clear()
        .envs(environment::inherited())
        .envs(passed_on())
        .env("PATH", path_with(app, Some(&install.node)))
        .env("DATA_DIR", data_dir(app))
        .stdin(Stdio::null())
        .output()
        .ok()?;
    let link = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (output.status.success() && link.starts_with(&running.url)).then_some(link)
}

fn spawn(app: &AppHandle, install: &Install, port: u16, key: &str) -> Result<Child, String> {
    let home = home_dir(app);
    let data = data_dir(app);
    std::fs::create_dir_all(&data).map_err(|e| format!("{}: {e}", data.display()))?;
    let out = log::open(app, log::RUNTIME_LOG).map_err(|e| format!("runtime log: {e}"))?;
    let err = out.try_clone().map_err(|e| format!("runtime log: {e}"))?;

    let mut command = Command::new(&install.node);
    // Ends the runtime when this app is gone without having stopped it.
    if let Ok(watchdog) = app
        .path()
        .resource_dir()
        .map(|dir| dir.join("watchdog.mjs"))
    {
        if let (true, Ok(url)) = (watchdog.exists(), Url::from_file_path(&watchdog)) {
            command.arg("--import").arg(url.as_str());
        }
    }
    command
        .arg(install.entry())
        // The install's `.env` is read from here, as the command line does.
        .current_dir(&home)
        .env_clear()
        .envs(environment::inherited())
        .env("PATH", path_with(app, Some(&install.node)))
        .env("NODE_ENV", "production")
        .env("API_HOST", "127.0.0.1")
        .env("API_PORT", port.to_string())
        .env("APP_URL", format!("http://127.0.0.1:{port}"))
        .env("DATA_DIR", &data)
        .env("LOCAL_ACCESS_KEY", key)
        .env("SECRETS", "keychain")
        .stdin(Stdio::null())
        .stdout(Stdio::from(out))
        .stderr(Stdio::from(err));
    if let Some(chrome) = environment::chrome_path() {
        command.env("CHROME_PATH", chrome);
    }
    #[cfg(unix)]
    {
        // Its own process group: stopping it also stops what it started (Chrome, claude).
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command
        .spawn()
        .map_err(|e| format!("{}: {e}", install.node.display()))
}

/// Stops a process of ours and what it started: asks first, so a runtime can close its browser,
/// then makes sure.
fn kill(child: &Arc<Mutex<Child>>) {
    let mut child = child.lock().unwrap();
    if matches!(child.try_wait(), Ok(Some(_))) {
        return;
    }
    #[cfg(unix)]
    {
        let group = -(child.id() as i32);
        unsafe { libc::kill(group, libc::SIGTERM) };
        let deadline = Instant::now() + Duration::from_secs(4);
        while Instant::now() < deadline && matches!(child.try_wait(), Ok(None)) {
            thread::sleep(Duration::from_millis(50));
        }
        unsafe { libc::kill(group, libc::SIGKILL) };
    }
    #[cfg(not(unix))]
    {
        let _ = child.kill();
    }
    let _ = child.wait();
}

fn fail(app: &AppHandle, generation: u64, message: String) {
    log::line(app, format!("runtime failed: {message}"));
    {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        if inner.generation != generation || inner.quitting {
            return;
        }
        inner.phase = Phase::Failed;
        inner.error = Some(message);
        inner.origin = None;
        inner.sidecar = None;
    }
    window::show_shell(app);
}

/// Marks the runtime as up and shows it, unless somebody is looking at the server choice:
/// picking "this Mac" shows it then.
fn ready(app: &AppHandle, generation: u64) -> bool {
    let waiting = {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        if inner.generation != generation || inner.quitting {
            return false;
        }
        if let Some(sidecar) = inner.sidecar.as_mut() {
            sidecar.ready = true;
        }
        matches!(inner.phase, Phase::Starting | Phase::Installing)
    };
    if waiting {
        window::show_local(app);
    }
    true
}

/// The runtime the window showed is gone: back to the splash while another one starts.
fn gone(app: &AppHandle) {
    let shown = {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        inner.sidecar = None;
        let shown = inner.phase == Phase::Running;
        if shown {
            inner.origin = None;
            inner.phase = Phase::Starting;
        }
        shown
    };
    if shown {
        window::show_shell(app);
    }
}

/// Shows a runtime the command line started, until it stops. False: it could not be entered.
fn attach(app: &AppHandle, generation: u64, install: &Install, running: &Running) -> bool {
    let Some(entry) = entry_link(app, install, running) else {
        return false;
    };
    {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        if inner.generation != generation || inner.quitting {
            return true;
        }
        inner.sidecar = Some(Sidecar {
            child: None,
            origin: running.url.clone(),
            ready: false,
            entry: Some(entry),
        });
    }
    log::line(
        app,
        format!(
            "showing the runtime that already runs: pid {}, {}",
            running.pid, running.url
        ),
    );
    if !ready(app, generation) {
        return true;
    }
    let mut missed = 0;
    while missed < 3 {
        thread::sleep(Duration::from_secs(1));
        if !current(app, generation) {
            return true;
        }
        missed = if healthy(running.port) { 0 } else { missed + 1 };
    }
    log::line(app, "that runtime stopped; starting one");
    gone(app);
    true
}

/// Starts the runtime on this machine and shows it; the calling thread then watches over it.
fn boot(app: AppHandle, mut generation: u64) {
    loop {
        let install = match ensure_install(&app, generation) {
            Ok(install) => install,
            Err(message) if message == "cancelled" => return,
            Err(message) => return fail(&app, generation, message),
        };
        if let Some(running) = running_elsewhere(&app) {
            if !attach(&app, generation, &install, &running) {
                return fail(
                    &app,
                    generation,
                    format!(
                        "engenty wizards already runs on this data folder (pid {}), but the window could not enter it. Stop it with `engenty-wizards stop`.",
                        running.pid
                    ),
                );
            }
            if !current(&app, generation) {
                return;
            }
            continue;
        }
        let began = Instant::now();
        let started = free_port(&app)
            .map_err(|e| format!("no free port: {e}"))
            .and_then(|port| Ok((port, access_key()?)))
            .and_then(|(port, key)| Ok((spawn(&app, &install, port, &key)?, port, key)));
        let (child, port, key) = match started {
            Ok(started) => started,
            Err(message) => return fail(&app, generation, message),
        };
        let pid = child.id();
        let child = Arc::new(Mutex::new(child));
        let origin = format!("http://127.0.0.1:{port}");
        {
            let shell = app.state::<Shell>();
            let mut inner = shell.inner.lock().unwrap();
            if inner.generation != generation || inner.quitting {
                drop(inner);
                return kill(&child);
            }
            if inner.phase == Phase::Installing {
                inner.phase = Phase::Starting;
            }
            inner.sidecar = Some(Sidecar {
                child: Some(child.clone()),
                origin: origin.clone(),
                ready: false,
                entry: Some(format!("{origin}/api/local/enter?k={key}")),
            });
        }
        log::line(
            &app,
            format!(
                "runtime {} starting: pid {pid}, {origin}",
                install.version().unwrap_or_default()
            ),
        );

        loop {
            if !current(&app, generation) {
                return;
            }
            if let Ok(Some(status)) = child.lock().unwrap().try_wait() {
                return fail(
                    &app,
                    generation,
                    format!("The runtime stopped while starting ({status})."),
                );
            }
            if healthy(port) {
                break;
            }
            if began.elapsed() > START_TIMEOUT {
                kill(&child);
                return fail(
                    &app,
                    generation,
                    "The runtime did not answer within 60 seconds.".into(),
                );
            }
            thread::sleep(Duration::from_millis(100));
        }
        log::line(
            &app,
            format!(
                "runtime ready: {origin} after {} ms",
                began.elapsed().as_millis()
            ),
        );
        if !ready(&app, generation) {
            return;
        }

        // Watch: a runtime that stops by itself is started again once.
        let status = loop {
            thread::sleep(Duration::from_millis(500));
            if !current(&app, generation) {
                return;
            }
            if let Ok(Some(status)) = child.lock().unwrap().try_wait() {
                break status;
            }
        };
        {
            let shell = app.state::<Shell>();
            let mut inner = shell.inner.lock().unwrap();
            if inner.generation != generation || inner.quitting {
                return;
            }
            if inner.restarted {
                drop(inner);
                return fail(
                    &app,
                    generation,
                    format!("The runtime stopped again ({status})."),
                );
            }
            inner.restarted = true;
            inner.generation += 1;
            generation = inner.generation;
        }
        log::line(
            &app,
            format!("runtime stopped ({status}); starting it again"),
        );
        gone(&app);
    }
}

/// Starts the runtime on this machine in the background. `fresh` forgets an earlier restart.
pub fn start(app: &AppHandle, fresh: bool) {
    let (generation, installer) = {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        inner.generation += 1;
        inner.phase = Phase::Starting;
        inner.error = None;
        inner.origin = None;
        if fresh {
            inner.restarted = false;
        }
        (inner.generation, inner.installer.take())
    };
    let app = app.clone();
    thread::spawn(move || {
        // An installer of an earlier start must be gone before this one may run its own.
        if let Some(installer) = installer {
            kill(&installer);
        }
        boot(app, generation)
    });
}

/// Stops what the app started — the runtime, a running installer — and waits until it is gone.
/// A runtime the command line started is left running.
pub fn stop(app: &AppHandle) {
    let (sidecar, installer) = {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        inner.generation += 1;
        (inner.sidecar.take(), inner.installer.take())
    };
    if let Some(installer) = installer {
        kill(&installer);
        log::line(app, "installer stopped");
    }
    if let Some(child) = sidecar.and_then(|sidecar| sidecar.child) {
        kill(&child);
        log::line(app, "runtime stopped");
    }
}
