// Groups OpenCode Desktop's vertical session tabs by project, with collapsible headers.
// GUI-only plugin: the id comes from the package name, and the app loads it from the global config.

const { Plugin, Store, Style } = require("@opencode/plugin/gui")
const { Schema } = require("effect")
const { createEffect, onCleanup } = require("solid-js")

const LIST = '[data-titlebar-tab-list][data-orientation="vertical"]'
const HEADER = "data-tab-groups-header"
const HIDDEN = "data-tab-groups-hidden"

const normalize = (path) => path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()

const isWithin = (directory, root) => {
  const dir = normalize(directory)
  const base = normalize(root)

  return dir === base || dir.startsWith(base + "/")
}

const baseName = (path) => {
  const parts = path.replace(/\\/g, "/").replace(/\/+$/, "").split("/")

  return parts[parts.length - 1] || path
}

const styles = `
[${HEADER}] {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
  width: 100%;
  min-width: 0;
  min-height: 26px;
  margin: 0;
  padding: 0 6px 0 9px;
  border-radius: 6px;
  background: var(--v2-background-bg-layer-01, color-mix(in srgb, currentColor 5%, transparent));
  color: var(--v2-text-text-faint);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  user-select: none;
  -webkit-app-region: no-drag;
}
[${HEADER}] { margin-block-start: 14px; }
[${HEADER}][data-first] { margin-block-start: 8px; }
[${HEADER}]:hover { color: var(--v2-text-text-muted); background: var(--v2-background-bg-layer-02, color-mix(in srgb, currentColor 9%, transparent)); }
[data-tab-groups-toggle] {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 26px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1;
  text-align: start;
  cursor: pointer;
}
[data-tab-groups-toggle]:focus-visible { outline: 1px solid var(--v2-border-border-muted); outline-offset: 2px; border-radius: 4px; }
[data-tab-groups-chevron] { flex: 0 0 auto; width: 10px; height: 10px; opacity: 0.7; transition: transform 120ms ease; }
[${HEADER}][data-collapsed] [data-tab-groups-chevron] { transform: rotate(-90deg); }
[data-tab-groups-label] { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.25; }
[data-tab-groups-count] { flex: 0 0 auto; font-size: 10px; font-variant-numeric: tabular-nums; opacity: 0.6; }
[${HEADER}]:not([data-collapsed]) [data-tab-groups-count] { display: none; }
[data-tab-groups-new] {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 120ms ease, background 120ms ease;
}
[data-tab-groups-new] svg { width: 16px; height: 16px; }
[data-tab-groups-new]:hover { opacity: 1; background: color-mix(in srgb, currentColor 12%, transparent); }
[data-tab-groups-new]:focus-visible { outline: 1px solid var(--v2-border-border-muted); outline-offset: 1px; opacity: 1; }
[data-slot="vertical-tabs"] [data-titlebar-tab-slot] [data-titlebar-tab-link] > span:has(> [data-component="project-avatar-v2"]):not(:has(> [data-slot="tab-avatar-unread-dot"])) { display: none; }
[data-slot="vertical-tabs"] [data-titlebar-tab-slot] [data-titlebar-tab-link] > span:has(> [data-component="project-avatar-v2"]) > [data-component="project-avatar-v2"] { display: none; }
[data-slot="vertical-tabs"] [data-titlebar-tab-slot] [data-titlebar-tab-link]:has(> span > [data-component="project-avatar-v2"]) { padding-inline-start: calc(var(--tab-link-inset) + 16px); }
`

// Longest-root match, so a session in a worktree or a nested project belongs to that project, not to its folder.
function projectFor(server, directory) {
  const projects = server?.data?.project?.list?.() ?? []
  let match

  for (const project of projects) {
    for (const root of [project.canonical, ...(project.sandboxes ?? [])]) {
      if (typeof root !== "string" || !root || !isWithin(directory, root)) continue

      const depth = normalize(root).length

      if (!match || depth > match.depth) match = { depth, project }
    }
  }

  return match?.project
}

module.exports = Plugin.define({
  stores: {
    collapsed: Store.global(Schema.Record(Schema.String, Schema.Boolean), {}),
  },
  setup(ctx) {
    console.info("[enhanced-tabs] active")

    const vertical = () => !!document.querySelector('[data-slot="vertical-tabs"]')

    const snapshot = () => {
      const groups = []
      const byKey = new Map()
      const groupOfTab = new Map()
      const updated = new Map()
      const drafts = []

      for (const tab of ctx.tabs.list()) {
        const session = tab.session
        const directory = session?.location?.directory

        if (!session || !directory) {
          drafts.push(tab.key)

          continue
        }

        const project = projectFor(session.server, directory)
        const key = project ? `${session.server.id}|${project.id}` : `${session.server.id}|${normalize(directory)}`
        const root = project?.worktree ?? project?.canonical ?? directory
        const label = project?.name?.trim() || baseName(root)
        const info = session.server.data.session.get(session.id)

        if (!byKey.has(key)) {
          const group = { key, label, server: session.server.id, directory: root, tabs: [] }
          byKey.set(key, group)
          groups.push(group)
        }

        const group = byKey.get(key)
        group.tabs.push(tab.key)
        groupOfTab.set(tab.key, group)
        updated.set(tab.key, info?.time?.updated ?? 0)
      }

      for (const group of groups) {
        group.tabs.sort((a, b) => (updated.get(b) ?? 0) - (updated.get(a) ?? 0))
      }

      return { order: [...drafts, ...groups.flatMap((group) => group.tabs)], groups, groupOfTab }
    }

    const collapsed = (key) => ctx.stores.collapsed.value[key] === true

    const toggle = (key) => {
      ctx.stores.collapsed.update((draft) => {
        if (draft[key]) delete draft[key]
        else draft[key] = true
      })

      schedule()
    }

    // The sidebar's project list may not be loaded yet; resolve projects as soon as it is.
    const syncing = new Set()

    createEffect(() => {
      for (const tab of ctx.tabs.list()) {
        const server = tab.session?.server

        if (!server || syncing.has(server.id) || server.data.project.list().length > 0) continue

        syncing.add(server.id)
        void server.data.project
          .sync()
          .catch(() => undefined)
          .finally(() => syncing.delete(server.id))
      }
    })

    // Keep same-project tabs contiguous and stable inside a group, so headers never repeat.
    let applying = false

    createEffect(() => {
      const desired = snapshot().order
      const keys = () => ctx.tabs.list().map((tab) => tab.key)

      if (applying || !vertical()) return

      const current = keys()

      if (desired.length !== current.length || desired.every((key, index) => current[index] === key)) return

      applying = true

      try {
        for (let index = 0; index < desired.length; index++) {
          const order = keys()

          if (order[index] === desired[index] || !order.includes(desired[index])) continue

          ctx.tabs.move(desired[index], index)
        }
      } finally {
        applying = false
      }
    })

    ctx.add(Style, styles)

    const headers = new Map()
    let list
    let observer
    let frame
    let timer

    const findList = () => document.querySelector(LIST)

    const newSession = (group) => {
      const server = ctx.servers.get(group.server)

      if (!server) return

      ctx.stores.collapsed.update((draft) => {
        delete draft[group.key]
      })
      schedule()

      void server.client.session
        .create({ location: { directory: group.directory } })
        .then((session) => ctx.tabs.open({ server: group.server, id: session.id }, { focus: true }))
        .catch(() => ctx.toast.show({ title: `Could not create a session in ${group.label}` }))
    }

    // Prefer the app's own icon sprite, so we reuse the exact icon used for New session.
    const icon = (pathData, viewBox = "0 0 10 10", strokeWidth = 1.3, sprite) => {
      const ns = "http://www.w3.org/2000/svg"
      const svg = document.createElementNS(ns, "svg")
      svg.setAttribute("viewBox", viewBox)
      svg.setAttribute("fill", "none")
      svg.setAttribute("stroke", "currentColor")
      svg.setAttribute("stroke-width", strokeWidth)
      svg.setAttribute("stroke-linecap", "round")
      svg.setAttribute("stroke-linejoin", "round")
      svg.setAttribute("aria-hidden", "true")

      if (sprite && document.getElementById(`opencode-v2-icon-${sprite}`)) {
        const use = document.createElementNS(ns, "use")
        use.setAttribute("href", `#opencode-v2-icon-${sprite}`)
        svg.append(use)

        return svg
      }

      const path = document.createElementNS(ns, "path")
      path.setAttribute("d", pathData)
      svg.append(path)

      return svg
    }

    const createHeader = (group) => {
      const header = document.createElement("div")
      header.setAttribute(HEADER, group.key)

      const toggleButton = document.createElement("button")
      toggleButton.type = "button"
      toggleButton.setAttribute("data-tab-groups-toggle", "")
      toggleButton.addEventListener("click", (event) => {
        event.preventDefault()
        event.stopPropagation()
        toggle(group.key)
      })

      const chevron = icon("M1.75 3.5 5 6.75l3.25-3.25")
      chevron.setAttribute("data-tab-groups-chevron", "")

      const label = document.createElement("span")
      label.setAttribute("data-tab-groups-label", "")

      const count = document.createElement("span")
      count.setAttribute("data-tab-groups-count", "")

      toggleButton.append(chevron, label, count)

      const add = document.createElement("button")
      add.type = "button"
      add.setAttribute("data-tab-groups-new", "")
      add.append(
        icon(
          "M13.5556 8.21529V13.5556H2.44446L2.44446 2.44445H7.78474M6.00002 8.16216V10H7.83786L14 3.83784L12.1622 2L6.00002 8.16216Z",
          "0 0 16 16",
          1.6,
          "edit",
        ),
      )
      add.addEventListener("click", (event) => {
        event.preventDefault()
        event.stopPropagation()
        newSession(group)
      })

      header.append(toggleButton, add)

      return header
    }

    const sync = () => {
      const target = findList()

      if (!target) return

      const { groups, groupOfTab } = snapshot()
      const present = new Set(groups.map((group) => group.key))
      const slots = new Map()

      for (const child of target.children) {
        const key = child.getAttribute("data-tab-key")

        if (key && child.hasAttribute("data-titlebar-tab-slot")) slots.set(key, child)
      }

      groups.forEach((group, index) => {
        let header = headers.get(group.key)

        if (!header) {
          header = createHeader(group)
          headers.set(group.key, header)
        }

        const folded = collapsed(group.key)
        header.toggleAttribute("data-collapsed", folded)
        header.toggleAttribute("data-first", index === 0)

        const toggleButton = header.querySelector("[data-tab-groups-toggle]")
        const add = header.querySelector("[data-tab-groups-new]")
        const label = header.querySelector("[data-tab-groups-label]")
        const count = header.querySelector("[data-tab-groups-count]")

        toggleButton.setAttribute("aria-expanded", folded ? "false" : "true")
        toggleButton.title = group.label
        add.title = `New session in ${group.label}`
        add.setAttribute("aria-label", add.title)

        if (label.textContent !== group.label) label.textContent = group.label
        count.textContent = String(group.tabs.length)

        const anchor = group.tabs.map((key) => slots.get(key)).find(Boolean)

        if (!anchor) return

        if (header.parentElement !== target || header.nextElementSibling !== anchor) target.insertBefore(header, anchor)
      })

      for (const [key, header] of [...headers]) {
        if (present.has(key)) continue

        header.remove()
        headers.delete(key)
      }

      for (const [key, slot] of slots) {
        const group = groupOfTab.get(key)
        const hide = !!group && collapsed(group.key)

        if (hide) {
          slot.style.display = "none"
          slot.setAttribute(HIDDEN, "")

          continue
        }

        if (!slot.hasAttribute(HIDDEN)) continue

        slot.style.display = ""
        slot.removeAttribute(HIDDEN)
      }
    }

    const schedule = () => {
      if (frame) return

      frame = requestAnimationFrame(() => {
        frame = undefined
        sync()
      })
    }

    const attach = () => {
      const target = findList()

      if (target === list) return

      observer?.disconnect()
      observer = undefined
      list = target
      headers.clear()

      if (!target) return

      observer = new MutationObserver(schedule)
      observer.observe(target, { childList: true })
      schedule()
    }

    createEffect(() => {
      ctx.tabs.list()
      ctx.stores.collapsed.value
      attach()
      schedule()
    })

    timer = setInterval(attach, 300)

    onCleanup(() => {
      clearInterval(timer)
      observer?.disconnect()

      if (frame) cancelAnimationFrame(frame)

      for (const header of headers.values()) header.remove()

      headers.clear()

      for (const slot of document.querySelectorAll(`[${HIDDEN}]`)) {
        slot.style.display = ""
        slot.removeAttribute(HIDDEN)
      }
    })
  },
})
