# Privacy

Clawd Gains does not use the network. It does not send data to other computers.

## Data that the mod reads

- The environment variables that identify the terminal: `TERM_PROGRAM`, `TERM`, `GHOSTTY_RESOURCES_DIR`, `KITTY_WINDOW_ID`, `TMUX`, `STY`, `CLAUDE_CODE_FORCE_TERMINAL_IMAGES`, `NO_COLOR` and `FORCE_COLOR`.
- The `LANG` environment variable, to select the language.
- The `CLAUDE_CONFIG_DIR`, `HOME` and `USERPROFILE` environment variables, to find the Claude Code folder.
- Two Claude Code settings: `language` and `prefersReducedMotion`.
- The file `~/.claude/keybindings.json`, to show your shortcut. The mod does not change this file.

## Data that the mod writes

- Your statistics and your mode, in the local plugin store (`~/.claude/plugins/store/`).

## Events that the mod monitors

- The start and the end of each Claude turn.
- Permission requests from tools. The mod removes its key before the permission dialog opens.
- Text in the prompt. When you type, Clawd is not shown.

The mod does not change permission decisions, tool results or the text that you type. It does not read or write the files of your projects. It does not start processes.
