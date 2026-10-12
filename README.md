# blocks-only

A Claude Code mod for the Claude Desktop app. On a coding turn, Claude may not hand you an essay: it ends the turn by calling one `report` tool with typed blocks, the mod checks the report, and Desktop draws it as one card. Long prose lives inside a block and stays folded until you open it.

The idea is from [Claude Isn't Allowed to Write Me Prose](https://blog.kvit.app/posts/agent-not-allowed-to-write-prose/) on the Kvit blog.

## Install

```
/plugin install blocks-only --marketplace h3h/blocks-only
```

Answer `y` to add the marketplace, then pick a scope. Type that line in a terminal session; a mod installed at the user scope also loads in the Desktop app's Code tab, which is where this one draws.

## What it does

- Registers a `report` tool and tells Claude to end every turn that used a tool by calling it, with nothing after.
- Refuses a report that leaves out what a block has to include. The refusal names each missing field, so Claude fixes it and calls again.
- Stops a turn that used tools from ending without a report. After two reminders it lets the turn end and says so in the transcript.
- Draws the accepted report as a card: a headline, then *Needs you*, *What happened* and *Verification*. Each block is a tile with an icon; a tile with more to say unfolds when pressed.
- Folds the turn's prose into one "Working notes" row.
- Shows the report's first open decision above the prompt. Type its number into an empty prompt, or press a button, to send that option.

A turn that used no tool is a conversation and is answered in plain prose.

## Blocks

| Block | For | Refused unless it has |
|---|---|---|
| `change` | Edits and other output | `summary` |
| `finding` | Something learned | `why`; `level` is optional |
| `check` | How the work was checked | `status`; for `partial` or `not_run`, `notChecked` and `reason` |
| `warning` | A risk or a blocker | `severity`, `ifIgnored` |
| `question` | Something only you can settle | 2 to 6 `options`, each with `effect`; `reason` for the recommended one, or for having none |
| `next` | A proposed continuation | 2 to 6 `options`, one or more with the `instruction` it sends; `recommended`; `reason` |
| `unclassified` | Last resort | `whyNoFit` |

Every block has a one-line `summary` of at most 140 characters and an optional markdown `detail`, shown folded.

## Switch and settings

`/blocks-output off` turns the reports off, `/blocks-output on` turns them back on, and `/blocks-output` alone says which. The choice is kept across sessions. Reports already in the transcript keep drawing as cards.

The `order` setting chooses which section leads: `decisions-first` (default), `verification-first`, or `as-written`, which draws the blocks in the order Claude sent them with no sections.

## Limits

- Only the Desktop app is drawn for. In a terminal the reports are still required and show as an ordinary tool row.
- Subagents are not held to a report.
- While off, the `report` tool stays listed and refuses calls; a mod cannot take a registered tool away.

## Develop

```
claude --plugin-dir .
claude plugin validate .
claude plugin test .
```
