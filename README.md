# Weave — Real-Time Kanban with Dependency-Based Task Locking

A collaborative Kanban board where tasks can depend on other tasks — a task can't move to **In Progress** until everything it depends on is marked **Done**.

<img width="1510" height="1740" alt="weave-workflow-banner" src="https://github.com/user-attachments/assets/ea195f58-b320-4e2e-a30f-ab6faa62046b" />

---

## The Core Idea

Most task boards let you drag a card anywhere, anytime — nothing stops you from starting work whose prerequisites aren't finished. Weave enforces the order: a task stays **locked** until every task it depends on is **Done**, and the moment a dependency finishes, everything waiting on it unlocks automatically — including multi-step chains (A → B → C).

---

## Key Features

- **Fullstack MVC Architecture** — Node.js & Express backend following strict Model-View-Controller design.
- **Real Authentication** — Secure user sign-up and sign-in powered by **JWT** and **bcryptjs** password hashing.
- **MongoDB Atlas Integration** — Persistent cloud database storage with Mongoose schemas for Users, Boards, Tasks, and Invites.
- **Real-Time Collaboration (Socket.IO)** — Multi-user real-time board updates, live team member state, and instant task unlock propagation.
- **Drag-and-Drop Kanban Board** — Interactive board built with native HTML5 drag events and live dependency feedback.
- **Graph & Cycle Detection Engine** — A depth-first search (DFS) algorithm strictly prevents circular dependencies before saving.
- **Lock & Unlock Propagation** — Server-enforced dependency locking that cascades automatically through task chains.
- **Priority Engine & Critical Path** — Calculates the optimal next task to work on based on downstream dependency impact.
- **Team Collaboration & Invitations** — Share boards via email or direct links with role-based access control (Owner vs. Member).
- **Postman / Thunder Client Test Suite** — Fully documented and exportable API collection (`Weave_API_Collection.json`).

---

## Project Structure (Fullstack MVC)

```
Weave/
├── README.md                          # Project documentation
├── index.html                         # Deployment root redirect
├── Weave_API_Collection.json         # Postman / Thunder Client API test suite
│
├── Backend/                           # Node.js + Express + MongoDB Server
│   ├── server.js                      # Application entry point & Socket.IO server
│   ├── .env.example                   # Environment variable template
│   ├── models/                        # [M] Mongoose Data Models
│   │   ├── User.js
│   │   ├── Board.js
│   │   ├── Task.js
│   │   └── Invite.js
│   ├── controllers/                   # [C] Business Logic Controllers (MVC)
│   │   ├── authController.js
│   │   ├── boardController.js
│   │   ├── taskController.js
│   │   └── inviteController.js
│   ├── routes/                        # API Route Definitions
│   │   ├── auth.js
│   │   ├── boards.js
│   │   ├── tasks.js
│   │   └── invites.js
│   ├── middleware/                    # Auth verification middleware
│   │   └── auth.js
│   ├── utils/                         # Dependency engine, mailer, helpers
│   │   ├── engine.js
│   │   ├── mailer.js
│   │   └── helpers.js
│   └── test/                          # Unit tests (14 passing engine tests)
│       └── engine.test.js
│
└── Frontend/                          # [V] Client-Side Views & Assets
    ├── index.html                     # Kanban Dashboard & Dependency Graph
    ├── landing.html                   # Marketing / Overview landing page
    ├── login.html                     # User Sign in
    ├── signup.html                    # User Sign up
    ├── team.html                      # Team Collaboration & Members management
    ├── accept-invite.html             # Collaborative Board Invitation page
    ├── profile.html                   # User Profile & Activity overview
    ├── graph.html                     # Standalone Dependency Graph view
    ├── css/                           # Stylesheets for all pages
    └── js/                            # Client-side API client and controllers
```

---

## How the Algorithms Work

- **Cycle Detection (`utils/engine.js` / `Frontend/js/dependencyGraph.js`)**: Before saving a new dependency, a depth-first search walks outward from each proposed dependency through its dependencies. If that walk ever reaches back to the original task, adding the edge would close a loop, so it is rejected with a 400 Bad Request.
- **Lock Propagation (`utils/engine.js`)**: A task is locked if any of its prerequisites is not yet `DONE`. Every status change triggers server validation; completing a dependency unlocks all downstream tasks.
- **Critical Path Calculation**: Traverses the longest remaining dependency chain to identify the critical path of tasks that determine total project duration.

---

## Local Setup & Running

### 1. Start the Backend Server
```powershell
cd Backend
npm install
npm start
```
The server will run on `http://localhost:5000`.

### 2. Start the Frontend
```powershell
cd Frontend
npm start
```
The frontend will serve on `http://127.0.0.1:5500`.

---

## API Testing with Postman / Thunder Client

A complete, pre-configured collection file is included in the root directory: **`Weave_API_Collection.json`**.

1. Open **Postman** or **Thunder Client** in VS Code.
2. Click **Import** and choose `Weave_API_Collection.json`.
3. The collection is pre-configured with the base URL `http://localhost:5000/api` and includes:
   - **Authentication**: Signup, Login (automatically stores JWT token), Current User profile.
   - **Boards**: List boards, Create board, Board details, Critical path analysis.
   - **Tasks**: Create task, Move status (lock enforcement tested), Set dependencies (cycle detection tested).
   - **Invitations**: Send board invitation, Public preview, Accept invitation, List pending invites.
