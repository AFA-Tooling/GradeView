# Canvas importer (prototype)

`canvas_to_redis.py` reads one Canvas (bCourses) course and writes the **same Redis keys** that
`update_db.py` and `update_bins.py` write from the Google Sheet, so the API and website work unchanged.

| File | Role |
|---|---|
| `canvas_client.py` | Read-only REST client: pagination, retries, origin pinning, no logging of bodies |
| `canvas_transform.py` | Pure Canvas JSON → Redis values (unit-tested) |
| `canvas_to_redis.py` | The job: fetch → transform → upsert + prune (no FLUSHDB) |
| `canvas.env.example` | Settings to add to `dbcron/.env` |
| `tests/test_canvas_transform.py` | Tests on fake fixtures from the local "GradeView Mock" course |

## Run it
```bash
cd dbcron
python canvas_to_redis.py --dry-run                         # fetch + transform, write nothing
python canvas_to_redis.py --fixtures tests/fixtures/canvas_mock  # offline, always a dry run
python canvas_to_redis.py                                   # write to Redis
python -m pytest tests/test_canvas_transform.py -q          # tests
```
Never point a laptop at a real course. For local work use the mock Canvas
(`CANVAS_BASE_URL=http://localhost:8080`) and a scratch Redis.

## Redis layout
- **DB0** (`SERVER_DBINDEX`): `Categories`, `MAX POINTS`, one key per lower-cased student email. No other key may contain `@`.
- **DB1** (`BINS_DBINDEX`): `bins` (ascending upper-bound points; top bin = course total).
- **DB2** (`ADMIN_DBINDEX`, new, never flushed): `canvas:admins` (active Teachers/TAs, excluding section-limited staff) and `canvas:sync_meta` (status, counts, warnings; on failure keeps `last_success_at`).

## Grading policy
| Canvas state | What GradeView gets |
|---|---|
| Posted score | the number |
| Graded but hidden (manual posting / unposted) | `""` (students never see hidden grades) |
| Not graded yet | `""` |
| Excused | title left out of that student's record (does not count against them) |
| Assigned only to some students/sections | assignment skipped (warning) |
| Unpublished, omitted from final grade, or ungraded type | excluded |
| 0-point assignment | excluded unless extra credit has been posted |

An assignment enters `MAX POINTS` only once at least one rostered student can see a score. Otherwise every
student would see 0 out of full points on work nobody can see yet. Opt-ins: `CANVAS_RELEASE_ON_DUE`, `CANVAS_INCLUDE_FUTURE`.

The importer refuses courses with weighted groups (GradeView sums raw points) and courses that restrict
quantitative data. Students sharing an email get no record (fail closed). Duplicate titles get
` [<assignment id>]` (the lowest id keeps the plain name). "Summary" in titles becomes "summary", because
admin stats treat "Summary" specially.

## Before scheduling it (not done yet)
1. **Cron switch:** in `cronjob`, replace the `update_db` / `update_bins` / `flush_db` lines with one `canvas_to_redis.py`
   line (for example every 15 minutes). Never run both importers. In the Dockerfile, use `;` instead of `&&` so a failed
   first sync does not stop cron. Rebuild the image, because the crontab is installed at build time.
2. **Admins:** have the API read `canvas:admins` (cached, synchronous `isAdmin`) plus a break-glass list.
3. **Projections:** `getMaxPointsSoFar` (api/lib/studentHelper.mjs) sums every max in a category; make it sum only the titles a student has, so excused work drops out of projections too.
4. **Buckets page:** `website/src/views/buckets.js` shows hard-coded CS10 ranges and ignores `bins`.
5. **Production access:** an OAuth refresh-token flow for a scoped bCourses developer key (the prototype takes a token from `CANVAS_TOKEN`).
6. **Alternate/makeup assignments:** currently skipped; a mapping to the main assignment can come later.
