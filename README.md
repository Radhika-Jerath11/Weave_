Weave — Real-Time Kanban with Dependency-Based Task Locking

A Kanban board where tasks can depend on other tasks — a task can't move to In Progress until everything it depends on is marked Done.

The core idea

Most task boards let you drag a card anywhere, anytime — nothing stops you from starting work whose prerequisites aren't finished. TaskFlow enforces the order: a task stays locked until every task it depends on is Done, and the moment a dependency finishes, everything waiting on it unlocks automatically — including multi-step chains (A → B → C).

Features
Authentication — sign up / sign in, session-based (client-side for Phase 1; real JWT + bcrypt auth is planned for Phase 2)
Task CRUD with validation (title length, duplicate titles, required assignee)
Drag-and-drop Kanban board — built with native HTML5 drag events, no external library
Dependency selection — pick prerequisite tasks from a checklist when creating or editing a task
Cycle detection — a DFS-based check rejects any dependency that would create a circular chain (A depends on B, B depends on A, or longer loops) before it's ever saved
Lock / unlock propagation — completing a task re-evaluates every task that depends on it, cascading through multi-hop chains automatically, with no page refresh needed
Visual dependency graph — an animated SVG view of tasks as nodes and dependencies as arrows, color-coded by status (locked / ready / done), with hover-to-trace connections
Priority engine — scores every currently-workable task on downstream impact, assignment, due date, and priority level, to surface which task to work on next and why (see below)
Impact predictor — simulates what happens if a task slips by N days: which downstream tasks are affected, who's impacted, and which of those are true "end of chain" risks
Due-date notifications — checks for tasks due tomorrow or overdue and surfaces a browser notification (or an in-app toast if permission isn't granted)
Profile page — account info, completion progress, and recent activity for the logged-in user
Team page — tasks grouped by assignee, with per-person completion stats
LocalStorage persistence — all data survives a refresh, scoped per logged-in user
How the algorithms work

Cycle detection (JS/dependencyGraph.js): before saving a new dependency, a depth-first search walks outward from each proposed dependency through its dependencies. If that walk ever reaches back to the original task, adding the edge would close a loop, so it's rejected before being saved.

Lock propagation (JS/dependencyGraph.js): a task is locked if any of its dependencies isn't yet Done. Every status change triggers a full re-render, which recomputes lock status for all tasks — so finishing one task cascades to unlock everything downstream, however many steps away.

Priority engine (JS/priorityEngine.js): scores every task that's currently workable (not Done, not locked) on four factors — how many downstream tasks it would unlock if finished, whether it's assigned to the current user, its due date (overdue / due tomorrow), and its priority level — and returns the highest scorer along with a ranked breakdown of which factors contributed and by how much. Reuses the same BFS-style forward traversal as lock propagation, just counting reachable tasks instead of checking a boolean.

Impact predictor (JS/impactPredictor.js): given a task and a hypothetical delay, walks forward through every task that directly or indirectly depends on it (the same forward-dependency walk used elsewhere), and reports the full affected chain, which people are impacted, and which affected tasks are "end points" — ones nothing else downstream depends on, making them the most likely to actually miss their own deadline as a result.

Project structure
Weave/
├── index.html               Dashboard (Kanban board, dependency graph, activity)
├── login.html                Sign in
├── signup.html                Sign up
├── landing.html                 Marketing / product landing page
├── profile.html                  Account info, progress, recent activity
├── team.html                      Tasks grouped by assignee
│
├── CSS/
│   ├── landing.css
│   ├── login.css
│   ├── signup.css
│   ├── style.css              Dashboard shared styles
│   ├── profile.css
│   └── team.css
│
└── JS/
    ├── dependencyGraph.js   Pure cycle-detection + lock-computation engine
    ├── storage.js             LocalStorage / SessionStorage persistence
    ├── taskManager.js         Task validation, create/edit/delete logic
    ├── dueDateNotifier.js     Due-tomorrow / overdue check + notifications
    ├── priorityEngine.js       Scores workable tasks, suggests what's next
    ├── impactPredictor.js       Simulates downstream effect of a delay
    ├── graphView.js               Animated SVG dependency graph renderer
    ├── app.js                       Dashboard controller — wires everything together
    ├── profile.js                     Profile page logic
    ├── team.js                         Team page logic (groups tasks by assignee)
    ├── login.js / signup.js             Auth form logic
    └── pagetransition.js                Shared page-transition animation

dependencyGraph.js, priorityEngine.js, and impactPredictor.js are all intentionally UI-independent — no DOM access, no storage calls — so this same logic can be reused unchanged inside an Express controller in Phase 2.

Setup
Clone or download this repository
Open landing.html (or index.html directly) in a browser — no build step or server required for Phase 1
For local development, serving through Live Server (VS Code extension) is recommended over opening the file directly, since localStorage/sessionStorage behave more reliably over http:// than over a raw file:// path
