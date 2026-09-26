// Renders the course blocks and lecture lists from data/courses.json — edit that file, not this one.
// Markup uses the lab's Bootstrap 3 (Lumen) classes; there is no Bootstrap JS, so the navbar toggle
// and the tabs are handled here.
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

  // Course blocks
  const box = document.querySelector("[data-courses]")
  for (const c of data.courses) {
    const facts = el("dl", { class: "dl-horizontal facts" })
    for (const [k, v] of c.facts) facts.append(el("dt", {}, k), el("dd", {}, v))
    box.append(el("div", { class: "course", id: c.id },
      el("h3", {}, c.title, " ", el("small", {}, c.code)),
      el("p", { class: "text-muted" }, `${c.level} · ${c.instructors}`),
      el("p", {}, c.description),
      facts,
      el("p", { class: "course-actions" },
        el("a", { class: "btn btn-primary btn-sm", href: `${ALIVE}/course/about/${c.slug}` }, "Course on ALIVE"), " ",
        el("a", { class: "btn btn-default btn-sm", href: `${ALIVE}/preview/${c.slug}` }, "Free preview"), " ",
        c.syllabus
          ? el("a", { class: "btn btn-default btn-sm", href: file(c.syllabus) }, "Syllabus")
          : el("a", { class: "btn btn-default btn-sm", href: `${ALIVE}/course/about/${c.slug}` }, "Syllabus on ALIVE"), " ",
        el("a", { class: "btn btn-default btn-sm", href: `#${c.id}-1` }, "Lectures"))))
  }

  // Lecture tabs + tables
  const tabs = document.querySelector("[data-tabs]")
  const panels = document.querySelector("[data-panels]")
  const links = []
  for (const c of data.courses) {
    const a = el("a", { role: "tab", id: "tab-" + c.id, "aria-controls": "panel-" + c.id, href: "#" + c.id + "-1" },
      c.code, " ", el("span", { class: "badge" }, String(c.lectures.length)))
    a.addEventListener("click", (e) => { e.preventDefault(); select(c.id, true) })
    tabs.append(el("li", { role: "presentation" }, a)); links.push(a)

    const body = el("tbody")
    for (const l of c.lectures) {
      const items = []
      if (l.slides) items.push(el("a", { href: file(l.slides) }, `Slides (${ext(l.slides)})`))
      if (l.recording) items.push(el("a", { href: yt(l.recording) }, "Recording"))
      if (l.avatar) items.push(el("a", { href: yt(l.avatar) }, "Avatar video"))
      if (l.transcript) items.push(el("a", { href: file(l.transcript) }, "Transcript"))
      if (l.preview) items.push(el("a", { href: `${ALIVE}/preview/${c.slug}` }, "Free preview"))
      items.push(el("a", { href: `${ALIVE}/course/${c.slug}/classroom/${l.alive}`, class: "alive-link" }, "Open in ALIVE"))
      const mats = el("td", { class: "mats" })
      items.forEach((x, i) => { if (i) mats.append(el("span", { class: "sep", "aria-hidden": "true" }, " · ")); mats.append(x) })
      body.append(el("tr", { id: `${c.id}-${l.n}` },
        el("td", { class: "num" }, String(l.n)),
        el("td", {}, el("span", { class: "lec-title" }, l.title), el("br"), el("small", { class: "text-muted" }, data.topics[l.topic])),
        mats))
    }
    panels.append(el("div", { class: "lec-panel", role: "tabpanel", id: "panel-" + c.id, "aria-labelledby": "tab-" + c.id, hidden: "" },
      el("p", { class: "text-muted lec-note" }, `${c.title} · ${c.instructors}. ${c.note}`),
      el("table", { class: "table table-hover lectures" },
        el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "#"), el("th", { scope: "col" }, "Lecture"), el("th", { scope: "col" }, "Materials"))),
        body)))
  }

  function select(id, focus) {
    for (const c of data.courses) {
      const on = c.id === id
      const a = document.getElementById("tab-" + c.id)
      a.parentElement.classList.toggle("active", on)
      a.setAttribute("aria-selected", on); a.tabIndex = on ? 0 : -1
      document.getElementById("panel-" + c.id).hidden = !on
      if (on && focus) a.focus()
    }
  }
  tabs.addEventListener("keydown", (e) => {
    const i = links.indexOf(document.activeElement)
    if (i < 0 || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return
    const next = links[(i + (e.key === "ArrowRight" ? 1 : links.length - 1)) % links.length]
    select(next.id.slice(4), true); e.preventDefault()
  })

  // #bmed4590 (course block) or #bmed4590-12 (lecture) opens that course's tab and lands there.
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
