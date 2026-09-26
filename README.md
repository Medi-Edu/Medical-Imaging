# Medical Imaging at Rensselaer

Course site for **BMED 2300 Bio-Imaging and Bio-Instrumentation** (Ge Wang, Hisham Mohamed) and
**BMED 4590/6590 Medical Imaging** (Ge Wang), published at https://medi-edu.github.io/Medical-Imaging/.
Every lecture is also taught interactively on [ALIVE](https://alive.alivetutor.com/course).

## Editing

- **Lectures, course facts, descriptions:** `data/courses.json` — the page is rendered from it.
  Keep lecture titles identical to ALIVE's, and `alive` = the ALIVE lecture id (`Lecture_NN` for
  BMED 2300, `MI_G_NN` for BMED 4590/6590). `topic` is the gray label under each title
  (keys in `topics`). `recording` / `avatar` are YouTube video ids.
- **Page text and sections:** `index.html`. **Styles:** the WANG-AXIS lab stylesheet
  (`https://wang-axis.github.io/css/main.css`, linked, so this site always matches the lab site) plus a few
  additions in `assets/site.css`.
- **Feedback survey:** `pages/feedback.html` (Formspree).

No build step: commit to `main` and GitHub Pages publishes in about a minute. Preview locally with
`python3 -m http.server` in this folder (opening the file directly cannot load the JSON).
