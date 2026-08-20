# Weave — Real-Time Kanban with Dependency-Based Task Locking

A Kanban board where tasks can depend on other tasks — a task can't move to
**In Progress** until everything it depends on is marked **Done**. 
---

## The core idea

Most task boards let you drag a card anywhere, anytime — nothing stops you
from starting work whose prerequisites aren't finished. TaskFlow enforces
the order: a task stays **locked** until every task it depends on is
**Done**, and the moment a dependency finishes, everything waiting on it
unlocks automatically — including multi-step chains (A → B → C).

## Features

- **Authentication** — sign up / sign in, session-based (client-side for
  Phase 1; real JWT + bcrypt auth is planned for Phase 2)
- **Task CRUD** with validation (title length, duplicate titles, required
  assignee)
- **Drag-and-drop Kanban board** — built with native HTML5 drag events, no
  external library
- **Dependency selection** — pick prerequisite tasks from a checklist when
  creating or editing a task
- **Cycle detection** — a DFS-based check rejects any dependency that would
  create a circular chain (A depends on B, B depends on A, or longer loops)
  *before* it's ever saved
- **Lock / unlock propagation** — completing a task re-evaluates every task
  that depends on it, cascading through multi-hop chains automatically, with
  no page refresh needed
- **Visual dependency graph** — an animated SVG view of tasks as nodes and
  dependencies as arrows, color-coded by status (locked / ready / done),
  with hover-to-trace connections
- **Due-date notifications** — checks for tasks due tomorrow and surfaces a
  browser notification (or an in-app toast if permission isn't granted)
- **LocalStorage persistence** — all data survives a refresh, scoped per
  logged-in user

## How the algorithm works

**Cycle detection** (`JS/dependencyGraph.js`): before saving a new
dependency, a depth-first search walks outward from each proposed
dependency through *its* dependencies. If that walk ever reaches back to
the original task, adding the edge would close a loop, so it's rejected
with a clear error message instead of being saved.

**Lock propagation**: a task is locked if any of its dependencies isn't
yet Done. Every status change triggers a full re-render, which recomputes
lock status for all tasks from the current data — so finishing one task
correctly cascades to unlock everything downstream, however many steps
away, without any manual re-checking.

## Project structure

```
Weave/
├── index.html              
├── login.html              
├── signup.html               
├── landing.html               
│
├── CSS/
│   ├── landing.css
│   ├── login.css
│   ├── signup.css
│   └── style.css
│
└── JS/
    ├── dependencyGraph.js   Pure cycle-detection + lock-computation engine
    ├── storage.js            LocalStorage / SessionStorage persistence
    ├── taskManager.js        Task validation, create/edit/delete logic
    ├── dueDateNotifier.js    Due-tomorrow check + browser notifications
    ├── graphView.js           Animated SVG dependency graph renderer
    ├── app.js                  Dashboard controller — wires everything together
    ├── login.js / signup.js     Auth form logic
    └── pagetransition.js       Shared page-transition animation
```

## Setup

1. Clone or download this repository
2. Open `landing.html` (or `index.html` directly) in a browser — no build
   step or server required for Phase 1
3. For local development, serving through **Live Server** (VS Code
   extension) is recommended over opening the file directly, since
   `localStorage`/`sessionStorage` behave more reliably over `http://`
   than over a raw `file://` path
