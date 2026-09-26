// Renders the course cards and lecture tables from data/courses.json — edit that file, not this one.
// Colours and fonts come from the lab stylesheet; there is no Bootstrap JS, so the navbar toggle and the
// course toggle are handled here. Every link that leaves the page opens in a new tab.
(async function () {
  // Mobile navbar toggle
  const toggle = document.querySelector("[data-nav-toggle]")
  const menu = document.getElementById("navbar-collapse-1")
  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("in")
    toggle.setAttribute("aria-expanded", open)
    toggle.classList.toggle("collapsed", !open)
  })
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) { menu.classList.remove("in"); toggle.setAttribute("aria-expanded", false) } })

  // Teaching-innovation carousel: one slide at a time, advances every 2.5 s, pauses on hover/focus.
  const car = document.querySelector("[data-carousel]")
  if (car) {
    const items = [...car.querySelectorAll(".item")]
    const dots = [...car.querySelectorAll(".carousel-indicators li")]
    let at = 0, timer = null
    const show = (i) => {
      at = (i + items.length) % items.length
      items.forEach((x, k) => x.classList.toggle("active", k === at))
      dots.forEach((d, k) => { d.classList.toggle("active", k === at); d.firstElementChild.setAttribute("aria-current", k === at) })
    }
    const play = () => { clearInterval(timer); timer = setInterval(() => show(at + 1), 2500) }
    const stop = () => clearInterval(timer)
    dots.forEach((d, k) => d.addEventListener("click", () => show(k)))
    car.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => show(at + Number(b.dataset.step))))
    car.addEventListener("mouseenter", stop); car.addEventListener("mouseleave", play)
    car.addEventListener("focusin", stop); car.addEventListener("focusout", play)
    play()
  }

  const data = await fetch("data/courses.json").then((r) => r.json())
  const ALIVE = data.alive

  // el("a", {href, class}, "text", child, ...) — text goes in as textContent, never as HTML.
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) n.setAttribute(k, v)
    for (const k of kids) if (k != null) n.append(k)
    return n
  }
  // A link that leaves the page: always a new tab.
  const out = (href, cls, text, extra) => el("a", { href, class: cls, target: "_blank", rel: "noopener", ...extra }, text)
  const file = (p) => p.split("/").map(encodeURIComponent).join("/") // names contain spaces and "&"
  const ext = (p) => p.split(".").pop().toUpperCase().replace("PPTX", "PPT")
  const yt = (id) => "https://youtu.be/" + id
  const ENROLLED = "For enrolled students — everyone else sees the course page and its free preview"

  // Course cards
  const grid = document.querySelector("[data-courses]")
  for (const c of data.courses) {
    const kv = el("dl", { class: "kv" })
    for (const [k, v] of c.facts) kv.append(el("div", {}, el("dt", {}, k), el("dd", {}, v)))
    grid.append(el("article", { class: "panel-box course-card", id: c.id, "aria-labelledby": c.id + "-t" },
      el("header", {},
        el("span", { class: "label label-primary" }, c.code),
        el("h3", { id: c.id + "-t" }, c.title),
        el("p", { class: "meta" }, `${c.level} · ${c.instructors}`)),
      el("div", { class: "card-body" }, el("p", {}, c.description), kv),
      el("footer", {},
        el("div", { class: "btn-row" },
          out(`${ALIVE}/course/about/${c.slug}`, "btn btn-primary btn-sm", "Course on ALIVE"),
          out(`${ALIVE}/preview/${c.slug}`, "btn btn-default btn-sm", "Free preview"),
          c.syllabus
            ? out(file(c.syllabus), "btn btn-default btn-sm", "Syllabus")
            : out(`${ALIVE}/course/about/${c.slug}`, "btn btn-default btn-sm", "Syllabus")),
        el("p", { class: "access" }, "ALIVE lectures: enrolled students · Free preview: everyone"))))
  }

  // Lecture tables
  const tabs = document.querySelector("[data-tabs]")
  const panels = document.querySelector("[data-panels]")
  const buttons = []
  for (const c of data.courses) {
    const b = el("button", { type: "button", role: "tab", id: "tab-" + c.id, "aria-controls": "panel-" + c.id, class: "btn btn-sm" },
      `${c.code} (${c.lectures.length} lectures)`)
    b.addEventListener("click", () => select(c.id, true))
    tabs.append(b); buttons.push(b)

    const body = el("tbody")
    for (const l of c.lectures) {
      // Four fixed slots, so each kind of material stays in its own column even when one is missing.
      const mats = el("td", { class: "mats" })
      const slots = [
        l.slides && out(file(l.slides), "pill", `Slides (${ext(l.slides)})`),
        l.recording && out(yt(l.recording), "pill", "Recording"),
        l.avatar && out(yt(l.avatar), "pill", "Avatar"),
        l.transcript && out(file(l.transcript), "pill", "Transcript"),
      ]
      if (slots.some(Boolean)) mats.append(el("div", { class: "mat-grid" }, ...slots.map((x) => x || el("span", { "aria-hidden": "true" }))))
      else if (l.preview) mats.append(out(`${ALIVE}/preview/${c.slug}`, "pill", "Free preview"))
      else mats.append(el("span", { class: "muted" }, "On ALIVE only"))
      body.append(el("tr", { id: `${c.id}-${l.n}` },
        el("td", { class: "num" }, String(l.n)),
        el("td", { class: "title" }, l.title),
        el("td", {}, el("span", { class: "topic" }, data.topics[l.topic])),
        mats,
        el("td", { class: "go" }, out(`${ALIVE}/course/${c.slug}/classroom/${l.alive}`, "btn btn-primary btn-xs", "Open in ALIVE →",
          { title: ENROLLED, "aria-label": `Open lecture ${l.n} in ALIVE (enrolled students)` }))))
    }
    const cols = el("colgroup", {}, ...[50, 220, 160, 340, 150].map((w) => el("col", { style: `width:${w}px` })))
    const head = el("thead", {}, el("tr", {}, ...["#", "Lecture", "Topic", "Learning materials", "Interactive session"].map((h) => el("th", { scope: "col" }, h))))
    panels.append(el("div", { class: "lec-panel", role: "tabpanel", id: "panel-" + c.id, "aria-labelledby": "tab-" + c.id, hidden: "" },
      el("p", { class: "access-note" }, c.note),
      el("div", { class: "table-wrap" }, el("table", { class: "lectures" }, cols, head, body))))
  }

  function select(id, focus) {
    for (const c of data.courses) {
      const on = c.id === id
      const b = document.getElementById("tab-" + c.id)
      b.classList.toggle("btn-primary", on); b.classList.toggle("btn-default", !on)
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

  // #bmed4590 (course card) or #bmed4590-12 (lecture row) opens that course's table and lands there.
  function fromHash() {
    const h = location.hash.slice(1)
    const c = data.courses.find((x) => h === x.id || h.startsWith(x.id + "-"))
    select(c ? c.id : data.courses[0].id, false)
    // The rows are rendered after the browser already tried (and failed) to jump to the anchor.
    if (c) requestAnimationFrame(() => document.getElementById(h)?.scrollIntoView())
  }
  window.addEventListener("hashchange", fromHash)
  fromHash()
})()
