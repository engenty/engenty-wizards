//! The runtime this app brings along: a Node process on a loopback port, started with the app
//! and gone with it.

use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Manager, Url};

use crate::{
    environment, log,
    state::{Phase, Shell, Sidecar},
    window,
};

const START_TIMEOUT: Duration = Duration::from_secs(60);

/// Node sits next to the app's own binary (`externalBin`).
fn node_binary() -> std::io::Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let name = if cfg!(windows) { "node.exe" } else { "node" };
    Ok(exe.parent().unwrap_or(&exe).join(name))
}

/// Where the runtime keeps its databases, files and its secret.
pub fn data_dir(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = std::env::var("ENGENTY_WIZARDS_DATA_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("engenty-wizards"))
        .join("data")
}

/// A free loopback port — the one of the last start when it is still free, so that links into
/// the local runtime (a published wizard opened in the browser, a bookmark) outlive a restart.
fn free_port(app: &AppHandle) -> std::io::Result<u16> {
    let file = data_dir(app).join("desktop.port");
    let last = std::fs::read_to_string(&file)
        .ok()
        .and_then(|text| text.trim().parse::<u16>().ok());
    if let Some(port) = last {
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

fn spawn(app: &AppHandle, port: u16, key: &str) -> Result<Child, String> {
    let resources = app
        .path()
        .resource_dir()
        .map_err(|e| format!("no resource folder: {e}"))?;
    let runtime = resources.join("server");
    let entry = runtime.join("dist-server").join("server").join("index.js");
    if !entry.exists() {
        return Err(format!(
            "The runtime is not in the app ({}). Build it with scripts/desktop-bundle.mjs.",
            entry.display()
        ));
    }
    let node = node_binary().map_err(|e| e.to_string())?;
    let data = data_dir(app);
    std::fs::create_dir_all(&data).map_err(|e| format!("{}: {e}", data.display()))?;
    let out = log::open(app, log::RUNTIME_LOG).map_err(|e| format!("runtime log: {e}"))?;
    let err = out.try_clone().map_err(|e| format!("runtime log: {e}"))?;

    let mut command = Command::new(&node);
    // Ends the runtime when this app is gone without having stopped it.
    let watchdog = resources.join("watchdog.mjs");
    if let Ok(url) = Url::from_file_path(&watchdog) {
        if watchdog.exists() {
            command.arg("--import").arg(url.as_str());
        }
    }
    command
        .arg(&entry)
        .current_dir(&runtime)
        .env_clear()
        .envs(environment::inherited())
        .env("PATH", environment::login_path())
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
        .map_err(|e| format!("{}: {e}", node.display()))
}

/// Stops a runtime: asks first, so it can close its browser, then makes sure.
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

fn current(app: &AppHandle, generation: u64) -> bool {
    let shell = app.state::<Shell>();
    let inner = shell.inner.lock().unwrap();
    inner.generation == generation && !inner.quitting
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

/// Starts the built-in runtime and shows it; the calling thread then watches over it.
fn boot(app: AppHandle, mut generation: u64) {
    loop {
        let began = Instant::now();
        let started = free_port(&app)
            .map_err(|e| format!("no free port: {e}"))
            .and_then(|port| Ok((port, access_key()?)))
            .and_then(|(port, key)| Ok((spawn(&app, port, &key)?, port, key)));
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
            inner.sidecar = Some(Sidecar {
                child: child.clone(),
                origin: origin.clone(),
                ready: false,
                entry: Some(format!("{origin}/api/local/enter?k={key}")),
            });
        }
        log::line(&app, format!("runtime starting: pid {pid}, {origin}"));

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
        // Somebody looking at the server choice stays there; picking "this Mac" shows it then.
        let waiting = {
            let shell = app.state::<Shell>();
            let mut inner = shell.inner.lock().unwrap();
            if inner.generation != generation || inner.quitting {
                return;
            }
            if let Some(sidecar) = inner.sidecar.as_mut() {
                sidecar.ready = true;
            }
            inner.phase == Phase::Starting
        };
        if waiting {
            window::show_local(&app);
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
        inner.sidecar = None;
        let shown = inner.phase == Phase::Running;
        if shown {
            inner.origin = None;
            inner.phase = Phase::Starting;
        }
        drop(inner);
        log::line(
            &app,
            format!("runtime stopped ({status}); starting it again"),
        );
        if shown {
            window::show_shell(&app);
        }
    }
}

/// Starts the built-in runtime in the background. `fresh` forgets an earlier restart.
pub fn start(app: &AppHandle, fresh: bool) {
    let generation = {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        inner.generation += 1;
        inner.phase = Phase::Starting;
        inner.error = None;
        inner.origin = None;
        if fresh {
            inner.restarted = false;
        }
        inner.generation
    };
    let app = app.clone();
    thread::spawn(move || boot(app, generation));
}

/// Stops the built-in runtime, if it runs, and waits until it is gone.
pub fn stop(app: &AppHandle) {
    let sidecar = {
        let shell = app.state::<Shell>();
        let mut inner = shell.inner.lock().unwrap();
        inner.generation += 1;
        inner.sidecar.take()
    };
    if let Some(sidecar) = sidecar {
        kill(&sidecar.child);
        log::line(app, "runtime stopped");
    }
}
