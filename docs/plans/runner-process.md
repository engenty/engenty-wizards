# The runner as its own process

Decided 2026-10-05 for the cloud runtime: the runner (what executes runs) is separated from the
web (studio, share pages, API). Built 2026-10-10.

## Why

`compose.cloud.yaml` ran "web and runner in one process". Everything a run needed while it worked
lived in that process's memory: its abort handle, its concurrency slot, the question it waits on,
its browser and sandbox, the event bus the studio listens to. A second process could not serve
the same runs, a restart lost every open question, and the web could not be scaled apart from
the runs.

## What holds now

- **Roles.** `RUNTIME_ROLE` = `web`, `runner` or `all` (default). A local install stays one
  process (`all`). The cloud compose runs `runtime` as `web` and `runner` as `runner`, from the
  same image. A runner also listens on its port: the web forwards to it what only the process
  holding the run can answer (the browser's screen, acting on its page).
- **The queue is the control database.** `run_index` gained `owner` (the runner working on the
  run) and `seen` (its last heartbeat). Waking a run sets `active` and clears `owner`; a runner
  claims it in one statement that also counts the tenant's owned runs against its limit
  (`LIMIT_CONCURRENT_RUNS`, or the plan's number). Runs beyond the limit stay queued. Every
  runner polls every 2 s and takes what is unowned or whose owner fell silent for 30 s; a
  shutting-down runner drops its runs, so another takes them at once. There is no in-memory slot
  table and no one-shot resume any more.
- **Heartbeat.** While driving a run the runner writes `seen` every 10 s and reads the run's
  status: cancelled elsewhere → the step's signal aborts.
- **Questions to the person live in the row.** `run.ask` was already there; `run.answer` is new.
  The step polls the row every second until the answer, a timeout (15 min) or an abort. The
  answer route writes `answer` only when the open question's id matches. A claimed run starts
  with both cleared: the step asks again. `run.unattended` marks an autopilot test run (an MCP
  client fills its pages); it was a process-local set.
- **Change notices.** `watchRun()` in `engine/events.ts` fires on the process's own bus and on a
  1 s poll of `run.updated_at` and the newest event id. The SSE stream, the autopilot and
  `waitWhileMoving` use it; a change made in another process arrives within a second.
- **Runners register.** Table `runner` (`id`, `url`, `seen`) in the control database. `RUNNER_URL`
  names where the web reaches a runner (compose: `http://runner:8891`); without it the web
  answers "not found" for the browser's screen of a run another process holds.

## Ids across installs

Settled by the sync (2026-10-06): every tenant has its own database, a synced wizard keeps the
install's id inside that tenant, a space or wizard id a tenant made itself is refused for a sync
(`id_taken`), and the share link is made on the server. `local` as tenant and user id never
leaves an install. The runner id is `<hostname>-<random>`; run ids stay `nanoid(18)`.

## Not built

- The phone's model (`engine/device.ts`, the app's Apple Intelligence) is per process: the offer
  and the open requests live in memory and the `device` event rides the process's own bus. Where
  web and runner are apart, the runner never sees the phone's offer, so every call goes to the
  runtime's own model; on a runtime that runs as one process (`all`, every local install) the
  phone is used as before.
- A runner serves one browser container (`BROWSER_CDP_URL`); several runners share it.
- The studio's draft events (`services/draft-events.ts`) are process-local; one web process is
  assumed.
- Plugin jobs' "already running" guard is per process; `pluginJob.lastRunAt` keeps two runners
  from both starting a job within its interval only by chance.
