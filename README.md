# OpenCode Enhanced Tabs

GUI plugin for OpenCode Desktop that turns the vertical session tab strip into project groups.

## Features

- Project headers group session tabs by project, with collapsible folds (state persists across restarts).
- Same-project threads stay contiguous and are sorted newest-first by last activity.
- A `+` button on each project header creates a new session in that project and opens it.
- Thread titles are indented under their project name, and the per-tab project letter avatars are hidden in vertical mode.
- Only affects the side-tab layout; top tabs are untouched.

## Install

Requires OpenCode Desktop 2.2.x (GUI plugins are experimental).

Install straight from this repository:

```sh
opencode plugin add github:<owner>/opencode-enhanced-tabs
```

Any git specifier npm accepts works, for example:

```sh
opencode plugin add git+https://github.com/<owner>/opencode-enhanced-tabs.git
```

The command installs the package and adds it to the global `plugins` list. Restart the app, or reload the plugin in **Settings → Extensions → Plugins**.

### From a local clone

```sh
git clone <repo-url> D:\Dev\opencode-enhanced-tabs
```

Then add the absolute path to `plugins` in your global config (`~/.config/opencode/opencode.json` or `opencode.jsonc`):

```jsonc
{
  "plugins": ["D:/Dev/opencode-enhanced-tabs"]
}
```

## Disable

**Settings → Extensions → Plugins** → turn off `opencode-enhanced-tabs`.

## Layout

```
package.json          # exports "./gui-experimental"
gui-experimental.cjs  # prebuilt GUI bundle
```

The bundle only requires modules the desktop host provides (`@opencode/plugin/gui`, `effect`, `solid-js`), so there is nothing to install or compile.
