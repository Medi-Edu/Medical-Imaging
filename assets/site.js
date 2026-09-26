// Renders the course cards and lecture lists from data/courses.json — edit that file, not this one.
(async function () {
  const data = await fetch("data/courses.json").then((r) => r.json())
  const ALIVE = data.alive

  // el("a", {href, class}, "text", child, ...) — text goes in as textContent, never as HTML.
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) n.setAttribute(k, v)
    for (const k of kids) if (k != null) n.append(k)
    return n
  }
  const file = (p) => p.split("/").map(encodeURIComponent).join("/") // names contain spaces and "&"
  const ext = (p) => p.split(".").pop().toUpperCase().replace("PPTX", "PPT")
  const yt = (id) => "https://youtu.be/" + id
  const out = { target: "_blank", rel: "noopener" }
  const topicColor = (t) => `--c: var(--t-${t})`

  // Course cards
  const grid = document.querySelector("[data-courses]")
  for (const c of data.courses) {
    const facts = el("dl", { class: "facts" })
    for (const [k, v] of c.facts) facts.append(el("dt", {}, k), el("dd", {}, v))
    const actions = el("div", { class: "actions" },
      el("a", { class: "chip-link primary", href: `${ALIVE}/course/about/${c.slug}`, ...out }, "Course on ALIVE ↗"),
      el("a", { class: "chip-link", href: `${ALIVE}/preview/${c.slug}`, ...out }, "Free preview ↗"),
      c.syllabus
        ? el("a", { class: "chip-link", href: file(c.syllabus) }, "Syllabus (DOCX)")
        : el("a", { class: "chip-link", href: `${ALIVE}/course/about/${c.slug}`, ...out }, "Syllabus on ALIVE ↗"))
    grid.append(el("article", { class: "course", "aria-labelledby": c.id + "-t" },
      el("span", { class: "code" }, c.code),
      el("h3", { id: c.id + "-t" }, c.title),
      el("p", { class: "meta" }, `${c.level} · ${c.instructors}`),
      el("p", { class: "desc" }, c.description),
      facts, actions))
  }

  // Lecture tabs + panels
  const tabs = document.querySelector("[data-tabs]")
  const panels = document.querySelector("[data-panels]")
  const buttons = []
  for (const c of data.courses) {
    const b = el("button", { role: "tab", id: "tab-" + c.id, "aria-controls": "panel-" + c.id, type: "button" },
      c.code, el("span", { class: "count" }, String(c.lectures.length)))
    b.addEventListener("click", () => select(c.id, true))
    tabs.append(b); buttons.push(b)

    const used = [...new Set(c.lectures.map((l) => l.topic))]
    const arc = el("div", { class: "arc", "aria-label": "Lectures by topic" })
    const list = el("ol", { class: "lec-list" })
    for (const l of c.lectures) {
      const anchor = `${c.id}-${l.n}`
      arc.append(el("a", { href: "#" + anchor, style: topicColor(l.topic), title: `${l.n}. ${l.title} — ${data.topics[l.topic]}`, "aria-label": `Lecture ${l.n}: ${l.title}` }))
      const actions = el("div", { class: "actions" })
      if (l.slides) actions.append(el("a", { class: "chip-link", href: file(l.slides) }, `Slides (${ext(l.slides)})`))
      if (l.recording) actions.append(el("a", { class: "chip-link", href: yt(l.recording), ...out }, "Recording ↗"))
      if (l.avatar) actions.append(el("a", { class: "chip-link", href: yt(l.avatar), ...out }, "Avatar video ↗"))
      if (l.transcript) actions.append(el("a", { class: "chip-link", href: file(l.transcript) }, "Transcript (PDF)"))
      if (l.preview) actions.append(el("a", { class: "chip-link", href: `${ALIVE}/preview/${c.slug}`, ...out }, "Free preview ↗"))
      actions.append(el("a", { class: "chip-link primary", href: `${ALIVE}/course/${c.slug}/classroom/${l.alive}`, ...out }, "Open in ALIVE ↗"))
      list.append(el("li", { class: "lec", id: anchor },
        el("span", { class: "num" }, String(l.n)),
        el("div", {}, el("span", { class: "lec-title" }, l.title), el("span", { class: "tag", style: topicColor(l.topic) }, data.topics[l.topic])),
        actions))
    }
    const legend = el("ul", { class: "legend" })
    for (const t of used) legend.append(el("li", { style: topicColor(t) }, data.topics[t]))
    panels.append(el("div", { class: "panel", role: "tabpanel", id: "panel-" + c.id, "aria-labelledby": "tab-" + c.id, hidden: "" },
      el("p", { class: "note" }, `${c.title} · ${c.instructors}. ${c.note}`), arc, legend, list))
  }

  function select(id, focus) {
    for (const c of data.courses) {
      const on = c.id === id
      const b = document.getElementById("tab-" + c.id)
      b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1
      document.getElementById("panel-" + c.id).hidden = !on
      if (on && focus) b.focus()
    }
  }
  tabs.addEventListener("keydown", (e) => {
    const i = buttons.indexOf(document.activeElement)
    if (i < 0 || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return
    const next = buttons[(i + (e.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length]
    select(next.id.slice(4), true); e.preventDefault()
  })

  // A #bmed4590 or #bmed4590-12 link opens that course's tab (and lands on the lecture).
  function fromHash() {
    const h = location.hash.slice(1)
    const c = data.courses.find((x) => h === x.id || h.startsWith(x.id + "-"))
    select(c ? c.id : data.courses[0].id, false)
    // The list is rendered after the browser already tried (and failed) to jump to the anchor.
    if (c) requestAnimationFrame(() => document.getElementById(h === c.id ? "lectures" : h)?.scrollIntoView())
  }
  window.addEventListener("hashchange", fromHash)
  fromHash()
})()
