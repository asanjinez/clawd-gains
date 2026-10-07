# Contributing

## Run the mod without installation

Load the mod for one session. Claude Code loads your changes when you save a file.

```sh
claude --plugin-dir ~/mods/clawd-gains
```

Run the animation in a terminal, without Claude Code:

```sh
node preview.mjs          # Press x. Press 1-6 to change the exercise. Press q to stop.
node preview.mjs --demo   # The preview presses x automatically.
```

## Run the tests

```sh
node --test test/engine.test.mjs test/motion.test.mjs test/hold.test.mjs test/hooks.test.mjs
claude plugin test
```

Node runs the logic tests (`test/*.test.mjs`). `claude plugin test` runs `test/band.test.ts`. That test uses the official Claude Code test kit to examine the drawing.

## Settings

Edit `config.mjs`. Claude Code loads the change when you save the file.

| Key | Default | Function |
|---|---|---|
| `key` | `"x"` | The action key: one lowercase letter or one digit |
| `tapsPerRep` | `1` | The number of taps for one rep |
| `repsPerSet` | `10` | The number of reps before the exercise changes |
| `exercises` | `["curl","sentadillas","press","crabwalk"]` | The order of the exercises. Other exercises: `"dominadas"`, `"soga"` |
| `tiredAfterMs` | `4000` | The time without taps before Clawd is tired |
| `idleAfterMs` | `10000` | The time without taps before Clawd rests |
| `celebrateMs` | `3000` | The duration of the celebration |
| `mode` | `"discreto"` | When Clawd appears: `"subtle"`, `"always"` or `"off"`. The `/gains` command overrides this value |
| `inviteAfterMs` | `2000` | In subtle mode, the time before Clawd appears |
| `lang` | `"auto"` | `"auto"` uses the Claude Code language. `"en"` and `"es"` set the language |
| `place` | `"abajo"` | `"abajo"` uses the band above the prompt. `"panel"` uses a panel |
| `hd` | `"auto"` | `"auto"` uses images in kitty and Ghostty. `true` and `false` set the mode |
| `autoOpen` | `true` | With `place: "panel"`, the panel opens at the start of each turn |

## Files

| File | Function |
|---|---|
| `hooks/clawd-gains.mjs` | The mod. It receives the Claude Code events and draws the gym |
| `lib/engine.mjs` | Counts taps, reps and sets |
| `lib/motion.mjs` | Calculates the animation, 30 frames each second |
| `lib/parts.mjs` | Draws Clawd and the equipment |
| `lib/mini.mjs` | Draws the small Clawd for the invitation |
| `lib/hold.mjs` | Finds a key that you hold down. Claude Code does not report this, so the mod uses the time between key presses |
| `lib/i18n.mjs` | Contains the English and Spanish text |
| `lib/canvas.mjs`, `lib/png.mjs` | Make terminal cells or PNG images |

## Limits

- The band above the prompt cannot get the keyboard focus automatically. This is a Claude Code rule.
- Images show only in kitty 0.28 or later and in Ghostty, outside tmux and screen.
- Claude Code does not send an event for the permission dialog. The mod uses `tool.check` to find permission requests. The mod does not monitor MCP dialogs.

## Credits

The design uses ideas from Claude Code's `clawd-cooking` mod, [clawd](https://github.com/KebeliSamet0/clawd), [ClawdMoji](https://github.com/afspies/ClawdMoji) and [claude-code-mascot-statusline](https://github.com/TeXmeijin/claude-code-mascot-statusline). It does not use their code or art.
