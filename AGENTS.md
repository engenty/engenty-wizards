# Agent instructions

## Commits and pull requests

- Commit messages and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): description`, with `!` before the colon for a breaking change. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- PRs are squash-merged and the commit on `main` is the PR title alone, so the title is the commit message that stays.
- No coding-agent attribution in commits or PR titles: no `Co-authored-by:` trailer for Claude, Codex, Cursor, Copilot or any other assistant, and no "Generated with …" line. CI (`.github/workflows/pr-conventions.yml`) fails a PR that has one. Leave it out of PR descriptions as well; a footer a GitHub tool appends there by itself may stay (the description never reaches `main`, and CI doesn't check it).

## Copy

- Before you add or change words a person reads (UI strings in English and German, CLI output, error messages, emails, docs pages), read [docs/copy-style.md](docs/copy-style.md) and follow it: its rules, its glossary, and its patterns for each kind of string. Write each language as a native speaker would; never translate sentence by sentence. `pnpm copy:check` checks the mechanical rules.
