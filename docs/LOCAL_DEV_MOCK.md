# Run GradeView locally with fake data

This gets GradeView running on your laptop with one env file and one `make` command, using **fake** students and grades.
You do not need any project secrets, Google Sheets or Canvas access. You only sign in with your own berkeley.edu Google account.

## GradeView in one minute

GradeView is the grade portal for CS10 (Berkeley's intro CS course). Students sign in and see their scores by category, their
letter-grade "buckets" (the point range for each letter grade), and a concept map of what they have mastered. Course staff (admins) also see
an admin dashboard: score histograms, a list of all students, and alerts.

The app has three parts:

```
 Redis  ──►  API (Node/Express, port 8000)  ──►  Website (React, port 3000)  ──►  you
 (the grade data)    (checks who you are,              (the pages you click)
                      reads Redis, returns JSON)
```

- **Redis** is a small key-value database (think of one big Python dict) that holds every student's grades. On your laptop it runs
  inside **Docker**, which downloads Redis and runs it in an isolated "container", so you never install Redis yourself.
- **API** is a JavaScript web server (Express is the library it is built with) that the website asks for data. It answers in JSON.
  A **port** is the number after `localhost:` in a URL.

Where the grades in Redis come from:

| | Source → Redis |
|---|---|
| **Original setup (what `main` uses)** | Gradescope / PrairieLearn (where work is graded) → GradeSync (a separate repo) → Google Sheets. Separately, a "HAID" tab in a Google Sheet (kept up outside the code; nothing connects GradeSync to it) → `dbcron/update_db.py` → Redis |
| **New ([PR #57](https://github.com/AFA-Tooling/GradeView/pull/57), not merged yet)** | bCourses (Berkeley's Canvas) → `dbcron/canvas_to_redis.py` ("the importer") → Redis |
| **This local setup** | fake Canvas data saved in `dbcron/tests/fixtures/canvas_mock/` → `canvas_to_redis.py` → Redis |

You only need the last row to work on the website and API.

**What the team is working on now:** getting grades from bCourses instead of the Google Sheet, tested on a fake
"GradeView Mock" course so nobody handles real student data. Later, bCourses may become the only source for sign-in
and grades. That is not built yet, so for now you sign in with Google and the app reads Redis.

## What you need

- **Docker Desktop**, installed and open (check: `docker info` prints details, not an error). You do not need a Docker account.
- **Node.js 20.10 or newer** (`node -v` should print `v20.10` or higher; get the LTS version from nodejs.org)
- **Python 3.8 or newer** (`python3 --version`)
- **Git**, and your **berkeley.edu Google account** (only used to sign in to your local copy)
- macOS or Linux. On Windows, use WSL2 (not tested yet). On Ubuntu/WSL2, also run `sudo apt install python3-venv lsof curl`.

## Steps

```bash
git clone https://github.com/AFA-Tooling/GradeView.git
cd GradeView
git switch GV-13/canvas-importer-prototype   # the branch with this setup (until PR #57 is merged into main)
cp .env.example .env                         # then open .env and set DEV_ADMIN_EMAIL to YOUR berkeley.edu email
make mock-up
```

`make mock-up` prints steps `1/4` to `4/4`. The first run takes a few minutes because it downloads packages.
If a line starts with `ERROR:`, it stopped at that step. Fix what it says (see Troubleshooting) and run
`make mock-up` again. Rerunning is safe.

When it prints `GradeView is running with fake data`, you get your terminal back. The servers keep running in the
background. Open **http://localhost:3000** and:

1. Click **Sign in with Google** with the email you put in `.env`.
   Do not use the username/password boxes; they are an old, unused stub.
2. You land on the **ADMIN** page automatically (it is also in the top bar).

Your email is the only admin on your machine. Nothing you do here touches real data.

| Command | What it does |
|---|---|
| `make mock-up` | Start everything (also after a restart) |
| `make mock-down` | Stop everything (the fake data is kept) |
| `make mock-reset` | Stop everything and delete the local fake data (the next `make mock-up` reloads it) |

Editing code: the website reloads by itself when you save. After changing `api/` code, run `make mock-down`
and then `make mock-up`.

## What you will see

- **ADMIN → Assignments:** the mock course's categories and assignments. Click one for a histogram.
  "Projects" shows 1–4 only: Project 5's grades are hidden in Canvas, so the importer leaves it out.
- **ADMIN → Students:** 16 fake students (`mock.student01@example.com` …).
- **PROFILE:** pick a student to see their grades, buckets and concept map.

Two known bugs you will notice (both are good first tasks):
- ADMIN → Students: the **Final %** column always shows **0.00%**.
- **ALERTS** never lists anyone.

## How one page works (a code tour)

Follow the **ADMIN → Students** tab from the screen down to the data:

1. `website/src/views/admin.jsx`: the React page. It calls the API through `website/src/utils/apiv2.js`.
2. `api/v2/Routes/admin/studentScores/index.js`: the API route `GET /api/v2/admin/studentScores`.
   `api/v2/Routes/admin/index.js` checks that you are an admin first.
3. `api/lib/redisHelper.mjs`: reads Redis. Each student is one key (their email); `MAX POINTS` and
   `Categories` are special keys.
4. `dbcron/canvas_to_redis.py`: the job that filled Redis (here, from the fake fixtures).

Who counts as an admin: `api/config/default.json` (`admins`). `make mock-up` starts the API with only your
email as admin (through the `NODE_CONFIG` environment variable); the file itself is not changed, so there is nothing to undo.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Set DEV_ADMIN_EMAIL ... in the .env file` | Run `cp .env.example .env` in the `GradeView` folder and put your email in `DEV_ADMIN_EMAIL`. |
| `Docker is not running` | Open Docker Desktop and wait until `docker info` works (about 30 seconds), then `make mock-up`. |
| Docker says `email must be verified` | Docker Desktop is signed in to an unverified account. Sign out (whale icon → Sign out) and rerun; no account is needed. |
| `The local Redis has a different password` | You changed `REDIS_DB_SECRET`. Run `make mock-reset`, then `make mock-up`. |
| `Port 6390 is in use` | Another program uses that port. Add `REDIS_PORT=6391` to `.env`, run `make mock-reset`, then `make mock-up`. |
| `port 3000 already in use; assuming the website is running` (or 8000) | If you did not start it with `make mock-up`, quit that program (`lsof -i :3000` shows which one) and rerun. Google sign-in only works on port 3000. |
| The login page says `You are not a registered student or admin` | You signed in with a different Google account than `DEV_ADMIN_EMAIL`. Fix `.env`, then `make mock-down` and `make mock-up`. |
| You are sent back to the login page later on | Your Google sign-in expired (after about an hour). Sign in again. |
| The login page says `An error occurred` | The API stopped. Check `.dev-logs/api.log`, then `make mock-up`. |
| `make: *** No rule to make target 'mock-up'` | You are not in the `GradeView` folder or not on the branch: `cd GradeView && git switch GV-13/canvas-importer-prototype`. |
| The same step keeps failing after an interrupted first run | Delete the half-finished install and rerun: for step 2, `rm -rf dbcron/.venv`; for step 3, `rm -rf api/node_modules website/node_modules`. |
| Something else | Check the logs in `.dev-logs/` (`api.log`, `web.log`, `load.log`, and `npm-api.log` / `npm-web.log` from the first run). |

## Team rules

- **Fake data only.** Never point a local setup at a real course, a real Google Sheet, or production.
- **Never commit secrets.** `.env` files are ignored by git; keep tokens and keys out of code, issues and chat.
- Get a ticket number (`GV-xx`) from the team before you start. Until PR #57 is merged, branch off
  `GV-13/canvas-importer-prototype`: `git switch -c GV-20/fix-final-percent` (format `<ticket-id>/<short-description>`).
  Title the PR `[GV-20] ...`. Commit messages look like `fix(website): show final percent` (`type(area): what changed`).
  Do not push to `main`.
