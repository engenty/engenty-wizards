// Loaded into the runtime before its own code (`node --import`). The desktop app stops the
// runtime when it quits; if the app is killed instead, nobody does. Then this process is handed
// to launchd — its parent id changes — and it ends itself the same way the app would have.
const parent = process.ppid;
const timer = setInterval(() => {
  if (process.ppid === parent) {
    return;
  }
  clearInterval(timer);
  console.error("[desktop] the app is gone — stopping the runtime");
  process.kill(process.pid, "SIGTERM");
  setTimeout(() => process.exit(0), 4000).unref();
}, 2000);
timer.unref();
