import { installApp } from "./desktop.js";
import { layout, packageVersion, readInstallNote } from "./home.js";
import { CLIENTS, nodeIsCurrent } from "./machine.js";
import { command, openInstalledApp, setup } from "./setup.js";
import { open, start } from "./start.js";
import { status, stop } from "./status.js";
import { dim, tilde } from "./ui.js";
import { update } from "./update.js";

const HELP = `engenty wizards ${packageVersion()}

  ${command()} [start]    start it and open the studio; the first time, the setup runs first
  ${command()} setup      guided setup: an AI client to think with, ffmpeg, the Mac app
  ${command()} open       let this browser into the running studio (--print: only show the link)
  ${command()} status     what is installed and what runs
  ${command()} doctor     status, and what is wrong
  ${command()} stop       stop it; the data is kept
  ${command()} update     the newest version
  ${command()} app        install or update the Mac app

  --yes, -y          ask nothing and install nothing optional
  --client <name>    install this AI client without asking: ${CLIENTS.map((c) => c.id).join(", ")}
  --app              install the Mac app without asking
  --no-open          start without opening the browser
  --version, --help

  Everything lives in ~/.engenty/wizards (ENGENTY_HOME moves it); settings go into its .env.
`;

interface Args {
  command: string;
  yes: boolean;
  open: boolean;
  print: boolean;
  app: boolean;
  clients: string[];
}

function parse(argv: string[]): Args | string {
  const args: Args = { command: "", yes: false, open: true, print: false, app: false, clients: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--yes" || arg === "-y") {
      args.yes = true;
    } else if (arg === "--no-open") {
      args.open = false;
    } else if (arg === "--print") {
      args.print = true;
    } else if (arg === "--app") {
      args.app = true;
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
    } else if (args.command) {
      return `Unexpected argument ${arg}.`;
    } else {
      args.command = arg;
    }
  }
  args.command ||= "start";
  return args;
}

async function main(argv: string[]): Promise<number> {
  const args = parse(argv);
  if (typeof args === "string") {
    console.error(`${args}\n\n${HELP}`);
    return 2;
  }
  const paths = layout();
  const setupOptions = { yes: args.yes, clients: args.clients, app: args.app };
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
        const next = await setup(paths, setupOptions);
        if (next !== "start") {
          return next === "app" ? openInstalledApp() : next === null ? 130 : 0;
        }
      }
      return start(paths, { open: args.open });
    }
    case "setup": {
      const next = await setup(paths, setupOptions);
      if (next === "app") {
        return openInstalledApp();
      }
      return next === "start" ? start(paths, { open: args.open }) : next === null ? 130 : 0;
    }
    case "open":
      return open(paths, args.print);
    case "status":
      return status(paths, false);
    case "doctor":
      return status(paths, true);
    case "stop":
      return stop(paths);
    case "update":
      return update(paths);
    case "app":
      try {
        const path = await installApp(paths, packageVersion());
        console.log(`Mac app ${packageVersion()}: ${dim(tilde(path))}`);
        return 0;
      } catch (error) {
        console.error((error as Error).message);
        return 1;
      }
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
