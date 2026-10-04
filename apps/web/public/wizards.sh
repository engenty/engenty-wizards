#!/usr/bin/env bash
# engenty wizards — installer for macOS and Linux.
#
#   curl -fsSL https://engenty.ai/wizards.sh | bash
#
# It needs curl and tar, nothing else, and asks for no password. Everything goes into
# ~/.engenty/wizards (ENGENTY_HOME moves it):
#
#   tools/node-v<version>/   its own Node; a Node you already have is left alone
#   runtime/                 the package `engenty-wizards`, from the GitHub release
#   bin/engenty-wizards      the command, linked into ~/.local/bin
#   data/                    your wizards and results (made at the first start)
#
# Then the guided setup runs (`engenty-wizards setup`): an AI client to think with, ffmpeg,
# the Mac app. Running the installer again updates an install; your data is kept.
#
#   --yes            ask nothing and install nothing optional
#   --no-setup       only Node, the runtime and the command (what `update` and the Mac app run)
#   --version <v>    this version instead of the newest
#   --no-link        do not link the command into ~/.local/bin
#
# For tests: ENGENTY_WIZARDS_PACKAGE (an npm spec or a tarball instead of the release's
# package), ENGENTY_WIZARDS_NODE_VERSION, ENGENTY_WIZARDS_NO_LINK=1 (as --no-link).
#
# Written for the bash 3.2 that macOS ships. Nothing here reads stdin: the script itself may be
# arriving through it.
set -Eeuo pipefail

NODE_VERSION="${ENGENTY_WIZARDS_NODE_VERSION:-24.14.0}"
PACKAGE_NAME="engenty-wizards"
RELEASES="https://github.com/engenty/engenty-wizards/releases"

main() {
  YES=0
  SETUP=1
  LINK=1
  [ -n "${ENGENTY_WIZARDS_NO_LINK:-}" ] && LINK=0
  VERSION=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --yes | -y) YES=1 ;;
      --no-setup) SETUP=0 ;;
      --no-link) LINK=0 ;;
      --version)
        shift
        VERSION="${1:-}"
        [ -n "$VERSION" ] || die "--version needs a version, e.g. --version 0.1.0"
        ;;
      --help | -h)
        usage
        exit 0
        ;;
      *) die "Unknown option $1" ;;
    esac
    shift
  done

  BASE="${ENGENTY_HOME:-$HOME/.engenty}"
  HOME_DIR="$BASE/wizards"
  LOG="$HOME_DIR/logs/install.log"
  NODE_DIR="$HOME_DIR/tools/node-v$NODE_VERSION"
  WRAPPER="$HOME_DIR/bin/engenty-wizards"
  LOCAL_BIN="$HOME/.local/bin"

  style
  trap 'printf "%s" "$SHOW"' EXIT
  trap 'failed' ERR

  command -v curl >/dev/null 2>&1 || die "curl is needed and was not found."
  command -v tar >/dev/null 2>&1 || die "tar is needed and was not found."
  mkdir -p "$HOME_DIR/logs" "$HOME_DIR/tools" "$HOME_DIR/bin"
  printf '\n--- %s wizards.sh\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$LOG"

  banner
  printf '%s  Installing into %s\n%s\n' "${GRAY}┌$RESET" "$BOLD$(tilde "$HOME_DIR")$RESET" "$BAR"
  platform
  package
  node
  runtime
  command_link
  if [ "$SETUP" = 1 ]; then
    printf '%s  %s\n\n' "${GRAY}└$RESET" "Installed. The setup follows."
    printf '%s' "$SHOW"
    trap - EXIT ERR
    # The questions need a terminal; stdin may be the pipe this script came through.
    if [ "$YES" = 1 ] || [ "$TTY" != 1 ] || ! (exec </dev/tty) 2>/dev/null; then
      exec "$WRAPPER" setup --yes </dev/null
    fi
    exec "$WRAPPER" setup </dev/tty
  fi
  printf '%s  %s\n' "${GRAY}└$RESET" "Installed engenty wizards $INSTALLED."
}

usage() {
  cat <<'USAGE'
engenty wizards — installer for macOS and Linux

  curl -fsSL https://engenty.ai/wizards.sh | bash
  curl -fsSL https://engenty.ai/wizards.sh | bash -s -- --yes

Puts its own Node, the runtime and the `engenty-wizards` command into ~/.engenty/wizards
(ENGENTY_HOME moves it), then runs the guided setup. Run it again to update.

  --yes            ask nothing and install nothing optional
  --no-setup       only Node, the runtime and the command
  --version <v>    this version instead of the newest
  --no-link        do not link the command into ~/.local/bin

To remove it: delete ~/.engenty/wizards (your wizards and results are in its data/ folder)
and ~/.local/bin/engenty-wizards.
USAGE
}

# --- how it looks ----------------------------------------------------------------------------

style() {
  TTY=0
  RESET="" BOLD="" DIM="" GRAY="" GREEN="" RED="" ORANGE="" MAGENTA="" HIDE="" SHOW=""
  if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; then
    TTY=1
    RESET=$'\033[0m' BOLD=$'\033[1m' DIM=$'\033[2m' GRAY=$'\033[90m' GREEN=$'\033[32m'
    RED=$'\033[31m' ORANGE=$'\033[38;2;224;83;27m' MAGENTA=$'\033[35m'
    HIDE=$'\033[?25l' SHOW=$'\033[?25h'
  fi
  BAR="${GRAY}│$RESET"
  FRAMES=(◒ ◐ ◓ ◑)
}

banner() {
  # Only on a terminal: `update` and the Mac app read plain lines.
  if [ "$TTY" != 1 ]; then
    return
  fi
  printf '\n'
  printf '   %s▄██████▄%s\n' "$ORANGE" "$RESET"
  printf '   %s██%s ● ● %s██%s   %sengenty wizards%s\n' "$ORANGE" "$RESET$BOLD" "$RESET$ORANGE" "$RESET" "$BOLD" "$RESET"
  printf '   %s▀██████▀%s   %sFor the tasks that keep coming back.%s\n\n' "$ORANGE" "$RESET" "$DIM" "$RESET"
}

tilde() {
  case "$1" in
    "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;;
    *) printf '%s' "$1" ;;
  esac
}

# A finished step: the green diamond, what it was, and a detail in gray.
done_step() {
  [ "$TTY" = 1 ] && printf '\r\033[K'
  printf '%s  %s' "${GREEN}◇$RESET" "$1"
  [ -n "${2:-}" ] && printf '  %s' "$DIM$2$RESET"
  printf '\n%s\n' "$BAR"
}

die() {
  printf '%s' "${SHOW:-}"
  [ "${TTY:-0}" = 1 ] && printf '\r\033[K'
  printf '%s  %s\n' "${RED:-}■${RESET:-}" "$1" >&2
  trap - EXIT ERR
  exit 1
}

failed() {
  local tail=""
  [ -f "$LOG" ] && tail="$(tail -n 12 "$LOG" 2>/dev/null | sed 's/^/   /')"
  [ -n "$tail" ] && printf '\n%s\n' "$DIM$tail$RESET" >&2
  die "${STEP:-The installer} failed. The whole log: $(tilde "$LOG")"
}

# Runs a command with a spinner and the seconds it takes; its output goes to the log.
spin() {
  local label="$1" pid i=0 started=$SECONDS
  shift
  if [ "$TTY" != 1 ]; then
    "$@" >>"$LOG" 2>&1 </dev/null
    return
  fi
  "$@" >>"$LOG" 2>&1 </dev/null &
  pid=$!
  printf '%s' "$HIDE"
  while kill -0 "$pid" 2>/dev/null; do
    printf '\r\033[K%s  %s %s' "$MAGENTA${FRAMES[i % 4]}$RESET" "$label" "$DIM$((SECONDS - started))s$RESET"
    i=$((i + 1))
    sleep 0.12
  done
  printf '%s' "$SHOW"
  wait "$pid"
}

# Downloads a file with a bar that fills as it arrives.
download() {
  local url="$1" dest="$2" label="$3" pid total size filled i bar
  if [ "$TTY" != 1 ]; then
    curl -fsSL "$url" -o "$dest" 2>>"$LOG" </dev/null
    return
  fi
  total="$(curl -fsSIL "$url" 2>/dev/null </dev/null | tr -d '\r' |
    awk 'tolower($1) == "content-length:" { n = $2 } END { print n + 0 }' || true)"
  : >"$dest"
  curl -fsSL "$url" -o "$dest" 2>>"$LOG" </dev/null &
  pid=$!
  printf '%s' "$HIDE"
  while kill -0 "$pid" 2>/dev/null; do
    size="$(wc -c <"$dest" 2>/dev/null | tr -d ' ')"
    if [ "${total:-0}" -gt 0 ]; then
      filled=$((${size:-0} * 24 / total))
      [ "$filled" -gt 24 ] && filled=24
      bar=""
      i=0
      while [ "$i" -lt 24 ]; do
        if [ "$i" -lt "$filled" ]; then bar="${bar}█"; else bar="${bar}░"; fi
        i=$((i + 1))
      done
      printf '\r\033[K%s  %s  %s %s' "${MAGENTA}◒$RESET" "$label" "$ORANGE$bar$RESET" \
        "$DIM$((${size:-0} / 1048576)) of $((total / 1048576)) MB$RESET"
    else
      printf '\r\033[K%s  %s  %s' "${MAGENTA}◒$RESET" "$label" "$DIM$((${size:-0} / 1048576)) MB$RESET"
    fi
    sleep 0.1
  done
  printf '%s' "$SHOW"
  wait "$pid"
}

# --- the steps -------------------------------------------------------------------------------

platform() {
  STEP="Looking at this machine"
  local system machine name
  system="$(uname -s)"
  machine="$(uname -m)"
  case "$system" in
    Darwin)
      OS=darwin
      name="macOS $(sw_vers -productVersion 2>/dev/null || true)"
      # A terminal under Rosetta says x86_64 on a Mac with Apple silicon.
      [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = "1" ] && machine=arm64
      ;;
    Linux)
      OS=linux
      name="Linux"
      # Node's own builds need glibc.
      if (ldd --version 2>&1 || true) | grep -qi musl; then
        die "This Linux uses musl (Alpine). Use the Docker image instead: https://github.com/engenty/engenty-wizards#run-it-on-a-server"
      fi
      ;;
    *) die "$system is not supported: macOS and Linux are. On Windows, use WSL." ;;
  esac
  case "$machine" in
    arm64 | aarch64) ARCH=arm64 ;;
    x86_64 | amd64) ARCH=x64 ;;
    *) die "$machine is not supported: arm64 and x64 are." ;;
  esac
  done_step "$name on $ARCH"
}

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
  else
    sha256sum "$1" | awk '{ print $1 }'
  fi
}

node() {
  STEP="Installing Node $NODE_VERSION"
  if [ -x "$NODE_DIR/bin/node" ] && [ "$("$NODE_DIR/bin/node" --version 2>/dev/null)" = "v$NODE_VERSION" ]; then
    ln -sfn "node-v$NODE_VERSION" "$HOME_DIR/tools/node"
    done_step "Node $NODE_VERSION" "already here"
    return
  fi
  local name="node-v$NODE_VERSION-$OS-$ARCH" dist="https://nodejs.org/dist/v$NODE_VERSION" tmp expected actual
  tmp="$(mktemp -d "$HOME_DIR/tools/.node.XXXXXX")"
  download "$dist/$name.tar.gz" "$tmp/node.tar.gz" "Downloading Node $NODE_VERSION"
  # The file must be the one nodejs.org lists.
  expected="$(curl -fsSL "$dist/SHASUMS256.txt" 2>>"$LOG" </dev/null | awk -v file="$name.tar.gz" '$2 == file { print $1 }')"
  actual="$(sha256_of "$tmp/node.tar.gz")"
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    rm -rf "$tmp"
    die "The Node download does not match its checksum from nodejs.org."
  fi
  mkdir -p "$tmp/node"
  spin "Unpacking Node $NODE_VERSION" tar -xzf "$tmp/node.tar.gz" -C "$tmp/node" --strip-components 1
  # The headers are for compiling addons, which nothing here does: a third of Node's size.
  rm -rf "$tmp/node/include"
  rm -rf "$NODE_DIR"
  mv "$tmp/node" "$NODE_DIR"
  rm -rf "$tmp"
  ln -sfn "node-v$NODE_VERSION" "$HOME_DIR/tools/node"
  # An older Node of ours is not needed any more.
  for old in "$HOME_DIR"/tools/node-v*; do
    [ "$old" = "$NODE_DIR" ] || rm -rf "$old"
  done
  done_step "Node $NODE_VERSION" "$(tilde "$HOME_DIR/tools/node"), checksum from nodejs.org matches"
}

# GitHub answers /releases/latest with the address of the newest release: …/tag/v1.2.3
latest_version() {
  curl -fsSLI -o /dev/null -w '%{url_effective}' "$RELEASES/latest" 2>>"$LOG" </dev/null |
    sed -n 's#.*/tag/v##p'
}

# What gets installed, decided before anything is downloaded. The package is not on npm yet: it
# is the tarball of the GitHub release, which npm installs like one from its registry; what it
# depends on comes from the registry.
package() {
  STEP="Looking for the newest release"
  SPEC="${ENGENTY_WIZARDS_PACKAGE:-}"
  if [ -n "$SPEC" ]; then
    return
  fi
  if [ -z "$VERSION" ]; then
    VERSION="$(latest_version || true)"
  fi
  if [ -z "$VERSION" ]; then
    die "No release of engenty wizards was found at $RELEASES."
  fi
  SPEC="$RELEASES/download/v$VERSION/$PACKAGE_NAME-$VERSION.tgz"
}

runtime() {
  STEP="Installing engenty wizards"
  mkdir -p "$HOME_DIR/runtime"
  # npm is a script that asks for `node`: ours comes first on the PATH. No install scripts run;
  # the runtime works without them. --legacy-peer-deps: the dependencies as the package names
  # them and no peers on top, which nothing here uses (about 70 MB less).
  spin "Installing engenty wizards (about 650 MB on disk, a minute or two)" \
    env PATH="$NODE_DIR/bin:$PATH" "$NODE_DIR/bin/npm" install --prefix "$HOME_DIR/runtime" \
    --omit=dev --ignore-scripts --legacy-peer-deps --no-audit --no-fund --loglevel=error "$SPEC"
  INSTALLED="$(MANIFEST="$HOME_DIR/runtime/node_modules/$PACKAGE_NAME/package.json" \
    "$NODE_DIR/bin/node" -p 'require(process.env.MANIFEST).version')"
  done_step "engenty wizards $INSTALLED" "$(tilde "$HOME_DIR/runtime")"
}

command_link() {
  STEP="Writing the command"
  {
    printf '#!/bin/sh\n# engenty wizards — written by wizards.sh; running the installer again rewrites it.\n'
    # An install outside ~/.engenty finds its folder again through the command.
    if [ "$BASE" != "$HOME/.engenty" ]; then
      # shellcheck disable=SC2016
      printf 'export ENGENTY_HOME="${ENGENTY_HOME:-%s}"\n' "$BASE"
    fi
    printf 'exec "%s" "%s" "$@"\n' "$HOME_DIR/tools/node/bin/node" \
      "$HOME_DIR/runtime/node_modules/$PACKAGE_NAME/bin/engenty-wizards.mjs"
  } >"$WRAPPER"
  chmod 755 "$WRAPPER"
  if [ "$LINK" != 1 ]; then
    done_step "Command" "$(tilde "$WRAPPER")"
    return
  fi
  local link="$LOCAL_BIN/engenty-wizards"
  mkdir -p "$LOCAL_BIN"
  # Something else of that name is not ours to replace.
  if [ -e "$link" ] && [ ! -L "$link" ]; then
    done_step "Command" "$(tilde "$WRAPPER") ($(tilde "$link") exists and was left as it is)"
    return
  fi
  ln -sfn "$WRAPPER" "$link"
  done_step "Command" "$(tilde "$link")"
}

main "$@"
