use serde::Serialize;
use std::{
  env,
  net::TcpListener,
  path::PathBuf,
  process::{Child, Command, Stdio},
  sync::Mutex,
};
use tauri::{path::BaseDirectory, Manager, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeInfo {
  url: String,
  port: u16,
  workspace: String,
  runtime_dir: String,
  started: bool,
  error: Option<String>,
}

impl Default for BridgeInfo {
  fn default() -> Self {
    Self {
      url: String::new(),
      port: 0,
      workspace: String::new(),
      runtime_dir: String::new(),
      started: false,
      error: None,
    }
  }
}

#[derive(Default)]
struct BridgeState {
  child: Mutex<Option<Child>>,
  info: Mutex<BridgeInfo>,
}

impl Drop for BridgeState {
  fn drop(&mut self) {
    if let Ok(child) = self.child.get_mut() {
      if let Some(mut child) = child.take() {
        let _ = child.kill();
        let _ = child.wait();
      }
    }
  }
}

fn stop_bridge(state: &BridgeState) {
  if let Ok(mut guard) = state.child.lock() {
    if let Some(mut child) = guard.take() {
      let _ = child.kill();
      let _ = child.wait();
    }
  }
}

fn free_port() -> Result<u16, String> {
  TcpListener::bind("127.0.0.1:0")
    .map_err(|e| format!("Could not reserve a localhost bridge port: {e}"))?
    .local_addr()
    .map(|x| x.port())
    .map_err(|e| format!("Could not read localhost bridge port: {e}"))
}

fn runtime_dir(app: &tauri::AppHandle) -> PathBuf {
  if let Ok(custom) = env::var("EUTRYA_RUNTIME_DIR") {
    let path = PathBuf::from(custom);
    if path.join("desktop/server.mjs").is_file() {
      return path;
    }
  }

  if let Ok(resource) = app.path().resolve("runtime", BaseDirectory::Resource) {
    if resource.join("desktop/server.mjs").is_file() {
      return resource;
    }
  }

  // Development fallback: desktop/src-tauri -> repository root.
  PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn normalize_workspace(value: Option<String>) -> Result<PathBuf, String> {
  let raw = value
    .or_else(|| env::var("EUTRYA_WORKSPACE").ok())
    .map(PathBuf::from)
    .or_else(|| env::current_dir().ok())
    .ok_or_else(|| "Could not determine a workspace directory".to_string())?;

  std::fs::create_dir_all(&raw)
    .map_err(|e| format!("Could not create workspace {}: {e}", raw.display()))?;
  raw.canonicalize()
    .map_err(|e| format!("Could not resolve workspace {}: {e}", raw.display()))
}

fn node_command() -> String {
  if let Ok(node) = env::var("EUTRYA_NODE") {
    if !node.trim().is_empty() { return node; }
  }
  if let Ok(home) = env::var("HOME") {
    let shim = PathBuf::from(home).join(".local/share/mise/shims/node");
    if shim.is_file() { return shim.display().to_string(); }
  }
  for candidate in ["/usr/bin/node", "/usr/local/bin/node", "/opt/homebrew/bin/node"] {
    if PathBuf::from(candidate).is_file() { return candidate.to_string(); }
  }
  "node".to_string()
}

fn spawn_bridge(app: &tauri::AppHandle, state: &BridgeState, workspace: Option<String>) -> BridgeInfo {
  stop_bridge(state);

  let mut info = BridgeInfo::default();
  let runtime = runtime_dir(app);
  info.runtime_dir = runtime.display().to_string();

  let server = runtime.join("desktop/server.mjs");
  if !server.is_file() {
    info.error = Some(format!("Eutrya runtime bridge was not found at {}", server.display()));
    *state.info.lock().expect("bridge info mutex poisoned") = info.clone();
    return info;
  }

  let workspace = match normalize_workspace(workspace) {
    Ok(x) => x,
    Err(e) => {
      info.error = Some(e);
      *state.info.lock().expect("bridge info mutex poisoned") = info.clone();
      return info;
    }
  };
  info.workspace = workspace.display().to_string();

  let port = match free_port() {
    Ok(x) => x,
    Err(e) => {
      info.error = Some(e);
      *state.info.lock().expect("bridge info mutex poisoned") = info.clone();
      return info;
    }
  };
  info.port = port;
  info.url = format!("http://127.0.0.1:{port}");

  let mut command = Command::new(node_command());
  command
    .arg(&server)
    .arg("--port")
    .arg(port.to_string())
    .arg("--workspace")
    .arg(&workspace)
    .env("EUTRYA_DESKTOP", "1")
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());

  if env::var("EUTRYA_DESKTOP_DEMO").ok().as_deref() == Some("1") {
    command.arg("--demo");
  }

  match command.spawn() {
    Ok(child) => {
      *state.child.lock().expect("bridge child mutex poisoned") = Some(child);
      info.started = true;
    }
    Err(e) => {
      info.error = Some(format!(
        "Could not start the Eutrya Node runtime: {e}. Install Node.js 22+ or set EUTRYA_NODE."
      ));
    }
  }

  *state.info.lock().expect("bridge info mutex poisoned") = info.clone();
  info
}

#[tauri::command]
fn bridge_info(state: State<'_, BridgeState>) -> BridgeInfo {
  state.info.lock().expect("bridge info mutex poisoned").clone()
}

#[tauri::command]
fn restart_bridge(app: tauri::AppHandle, state: State<'_, BridgeState>) -> BridgeInfo {
  let workspace = state.info.lock().ok().map(|x| x.workspace.clone()).filter(|x| !x.is_empty());
  spawn_bridge(&app, &state, workspace)
}

#[tauri::command]
fn set_workspace(app: tauri::AppHandle, state: State<'_, BridgeState>, workspace: String) -> BridgeInfo {
  spawn_bridge(&app, &state, Some(workspace))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(BridgeState::default())
    .setup(|app| {
      let handle = app.handle().clone();
      let state = app.state::<BridgeState>();
      spawn_bridge(&handle, &state, None);
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![bridge_info, restart_bridge, set_workspace])
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { .. } = event {
        let state = window.state::<BridgeState>();
        stop_bridge(&state);
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running Eutrya");
}
