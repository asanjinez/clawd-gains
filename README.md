# Clawd Gains

Clawd trains while Claude works. Press `x` quickly and many times to do reps.

![Clawd Gains demo](assets/demo.gif)

A community mod for Claude Code.

## Install

Type these commands in Claude Code:

```text
/plugin marketplace add asanjinez/clawd-gains
/plugin install clawd-gains@clawd-gains
```

You must have Claude Code 2.1.284 or later.

## Play

When Claude works for more than 2 seconds, Clawd appears above the prompt.

1. Press `ctrl+x`, then press `tab`. Clawd gets the keyboard focus.
2. Press `x` quickly and many times. Each press is one rep. If you hold the key, it does not count.
3. Press `esc` to go back to the prompt.

## Commands

| Command | Function |
|---|---|
| `/gains` | Opens the gym |
| `/gains subtle` | Clawd appears when Claude works for more than 2 seconds. This is the default |
| `/gains always` | Clawd appears in each turn |
| `/gains off` | Clawd does not appear. The spinner shows the number of reps |
| `/gains stats` | Shows your record and your total reps |

## Shortcut

To use `alt+g` instead of `ctrl+x tab`, add this text to `~/.claude/keybindings.json`:

```json
{ "bindings": [{ "context": "Chat", "bindings": { "alt+g": "abovePrompt:focus" } }] }
```

## Privacy

The mod does not use the network. It does not send data. Refer to [PRIVACY.md](PRIVACY.md).

## License

MIT. This is an unofficial project. Clawd and Claude Code are the property of Anthropic.
