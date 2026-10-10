import { apps, connectCommand } from "./connect.js";
import { command, layout, packageVersion, readInstallNote } from "./home.js";
import { CLIENTS, nodeIsCurrent } from "./machine.js";
import { mcp } from "./mcp.js";
import { menu } from "./menu.js";
import { setup } from "./setup.js";
import { open, start, studio } from "./start.js";
import { autostart, restart, status, stop } from "./status.js";
import { update } from "./update.js";

const HELP = `engenty wizards ${packageVersion()}

  ${command()}            what runs, and a menu: start, stop, update …; the first time, the setup runs first
                        (needs a terminal)
  ${command()} start      start it and open the studio; it runs in this terminal until Ctrl-C
  ${command()} studio     open the studio; when it does not run, it starts as a service first
  ${command()} setup      guided setup: an AI client to think with, ffmpeg, start at login
  ${command()} open       let this browser into the running studio (--print: only show the link)
  ${command()} status     what is installed and what runs
  ${command()} doctor     status, and what is wrong
  ${command()} stop       stop it; the data is kept
  ${command()} restart    stop it and start it again (after an update: the new version)
  ${command()} update     the newest version
  ${command()} autostart  start it at login: on, off (macOS: a LaunchAgent; Linux: a systemd service)
  ${command()} connect    your wizards in your AI apps: every app found, or name them —
                        ${apps(layout())
                          .map((app) => app.id)
                          .join(", ")}
  ${command()} disconnect take them out again (same names)
  ${command()} mcp        the MCP server over stdio, as the AI apps start it

  --yes, -y          ask nothing and install nothing optional
  --client <name>    install this AI client without asking: ${CLIENTS.map((c) => c.id).join(", ")}
  --no-open          start without opening the browser
  --service, -s      start as a service, detached from this terminal; \`${command()} stop\` stops it
  --version, --help

  Everything lives in ~/.engenty/wizards (ENGENTY_HOME moves it); settings go into its .env.
`;

interface Args {
  command: string;
  /** What follows the command: \`autostart on\`. */
  value: string;
  /** The apps \`connect\` and \`disconnect\` name. */
  apps: string[];
  yes: boolean;
  open: boolean;
  service: boolean;
  print: boolean;
  clients: string[];
}

function parse(argv: string[]): Args | string {
  const args: Args = {
    command: "",
    value: "",
    apps: [],
    yes: false,
    open: true,
    service: false,
    print: false,
    clients: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--yes" || arg === "-y") {
      args.yes = true;
    } else if (arg === "--no-open") {
      args.open = false;
    } else if (arg === "--service" || arg === "-s") {
      args.service = true;
    } else if (arg === "--print") {
      args.print = true;
    } else if (arg === "--client") {
      const id = argv[++i];
      if (!CLIENTS.some((client) => client.id === id)) {
        return `--client takes one of: ${CLIENTS.map((c) => c.id).join(", ")}`;
      }
      args.clients.push(id);
    } else if (arg === "--help" || arg === "-h") {
      args.command = "help";
    } else if (arg === "--version" || arg === "-v") {
      args.command = "version";
    } else if (arg.startsWith("-")) {
      return `Unknown option ${arg}.`;
    } else if (args.command === "autostart" && !args.value) {
      args.value = arg;
    } else if (args.command === "connect" || args.command === "disconnect") {
      args.apps.push(arg);
    } else if (args.command) {
      return `Unexpected argument ${arg}.`;
    } else {
      args.command = arg;
    }
  }
  return args;
}

async function main(argv: string[]): Promise<number> {
  const args = parse(argv);
  if (typeof args === "string") {
    console.error(`${args}\n\n${HELP}`);
    return 2;
  }
  const paths = layout();
  const setupOptions = { yes: args.yes, clients: args.clients };
  if (!args.command) {
    // Without a command: the menu, which needs a terminal. Starting is \`start\`.
    if (args.service || !args.open || args.print) {
      console.error(`Options to start it go with start: ${command()} start ${argv.join(" ")}`);
      return 2;
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error(`The menu needs a terminal. To start it: ${command()} start\n\n${HELP}`);
      return 2;
    }
    return menu(paths, setupOptions, HELP);
  }
  switch (args.command) {
    case "help":
      console.log(HELP);
      return 0;
    case "version":
      console.log(packageVersion());
      return 0;
    case "start": {
      // The first start on a terminal begins with the setup.
      const first = !readInstallNote(paths).setupAt;
      if (first && !args.yes && process.stdin.isTTY && process.stdout.isTTY) {
        // You asked to start it: once the setup is done, it starts.
        if (!(await setup(paths, setupOptions))) {
          return 130;
        }
      }
      return start(paths, { open: args.open, background: args.service });
    }
    case "setup":
      return (await setup(paths, setupOptions)) ? 0 : 130;
    case "studio":
      return studio(paths);
    case "open":
      return open(paths, args.print);
    case "status":
      return status(paths, false);
    case "doctor":
      return status(paths, true);
    case "stop":
      return stop(paths);
    case "restart":
      return restart(paths);
    case "update":
      return update(paths);
    case "autostart":
      return autostart(paths, args.value);
    case "connect":
    case "disconnect":
      return connectCommand(paths, args.apps, args.command === "disconnect");
    case "mcp":
      return mcp(paths);
    default:
      console.error(`Unknown command ${args.command}.\n\n${HELP}`);
      return 2;
  }
}

if (!nodeIsCurrent()) {
  console.error(`engenty wizards needs Node.js 24.11 or newer; this is ${process.version}.`);
  process.exit(1);
}
process.exitCode = await main(process.argv.slice(2));
