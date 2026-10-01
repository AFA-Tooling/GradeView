"""Canvas (bCourses) -> Redis importer for GradeView (prototype). See CANVAS_IMPORTER.md.

Writes the same Redis keys as update_db.py / update_bins.py so the API and website need no change.
Instead of the hourly FLUSHDB it upserts every key and then prunes student keys that left the roster.

Usage (from dbcron/):
  python canvas_to_redis.py                       # fetch from Canvas and write to Redis
  python canvas_to_redis.py --dry-run             # fetch and transform, print a summary, write nothing
  python canvas_to_redis.py --fixtures DIR        # use saved Canvas JSON (always a dry run unless --write-fixtures)
  python canvas_to_redis.py --dump /tmp/out.json  # also save the payload. It contains student names, emails
                                                  # and grades: keep it outside the repo and never commit it.

Environment (see canvas.env.example): CANVAS_BASE_URL, CANVAS_COURSE_ID, CANVAS_TOKEN,
CANVAS_TOTAL_POINTS, CANVAS_ASSIGNMENT_POINTS, CANVAS_INCLUDE_FUTURE, CANVAS_RELEASE_ON_DUE,
CANVAS_CATEGORY_MAP, SERVER_HOST, SERVER_PORT, SERVER_DBINDEX, BINS_DBINDEX, ADMIN_DBINDEX, REDIS_DB_SECRET.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from canvas_client import CanvasClient, CanvasError, fetch_course
from canvas_transform import TransformError, build_payload

FIXTURE_FILES = {
    "course": "course.json",
    "assignment_groups": "assignment_groups.json",
    "assignments": "assignments.json",
    "students": "users_students.json",
    "staff": "users_staff.json",
    "staff_enrollments": "enrollments_ta.json",
    "submissions": "submissions_grouped.json",
    "grading_standard": "grading_standard.json",
}


def load_fixtures(directory):
    """Loads saved Canvas JSON files (same shape as fetch_course) from a directory."""
    d = Path(directory)
    raw = {key: json.loads((d / name).read_text()) for key, name in FIXTURE_FILES.items()}
    raw["grading_standard_source"] = "course" if raw["grading_standard"] else "none"
    return raw


def _flag(name):
    """Reads a true/false environment variable (default false)."""
    return os.getenv(name, "false").strip().lower() == "true"


def redis_clients():
    """Returns Redis clients for DB0 (grades), DB1 (bins) and DB2 (admins and sync status)."""
    import redis

    host = os.getenv("SERVER_HOST", "localhost")
    port = int(os.getenv("SERVER_PORT", "6379"))
    pw = os.getenv("REDIS_DB_SECRET")
    return {
        name: redis.Redis(host=host, port=port, db=int(os.getenv(var, default)), password=pw)
        for name, var, default in (("db0", "SERVER_DBINDEX", "0"), ("db1", "BINS_DBINDEX", "1"), ("db2", "ADMIN_DBINDEX", "2"))
    }


def write_payload(payload, clients, expected_course_id=None):
    """Upserts all keys, prunes departed students, and records sync status; refuses unsafe writes."""
    meta = payload["db2"]["canvas:sync_meta"]
    if expected_course_id is not None and str(meta["course_id"]) != str(expected_course_id):
        raise TransformError("Payload is for a different course than CANVAS_COURSE_ID; refusing to write")
    db0 = payload["db0"]
    students = {k for k in db0 if "@" in k}
    if not students:
        raise TransformError("No students in the Canvas data; refusing to write (would empty GradeView)")

    pipe = clients["db0"].pipeline(transaction=True)
    for key, value in db0.items():
        pipe.set(key, json.dumps(value))
    pipe.execute()

    stale = [k for k in clients["db0"].scan_iter(match="*@*") if k.decode() not in students]
    if stale:
        clients["db0"].delete(*stale)

    if "bins" in payload["db1"]:
        clients["db1"].set("bins", json.dumps(payload["db1"]["bins"]))

    db2 = payload["db2"]
    if db2["canvas:admins"]["emails"]:
        clients["db2"].set("canvas:admins", json.dumps(db2["canvas:admins"]))
    clients["db2"].set("canvas:sync_meta", json.dumps(meta))
    return {"students_written": len(students), "stale_removed": len(stale)}


def record_failure(message):
    """Marks the sync as failed while keeping when (and how big) the last good sync was."""
    try:
        db2 = redis_clients()["db2"]
        prev = json.loads(db2.get("canvas:sync_meta") or b"{}")
        ok = prev.get("status") in ("ok", "warning")
        db2.set("canvas:sync_meta", json.dumps({
            "status": "error",
            "error": message,
            "failed_at": datetime.now(timezone.utc).isoformat(),
            "course_id": os.getenv("CANVAS_COURSE_ID"),
            "last_success_at": prev.get("synced_at") if ok else prev.get("last_success_at"),
            "last_success_students": prev.get("students") if ok else prev.get("last_success_students"),
        }))
    except Exception:  # noqa: BLE001 - recording the failure must never mask it
        pass


def _describe(err):
    """Known errors carry safe messages; anything else is reported by type only, to keep data out of logs."""
    return str(err) if isinstance(err, (CanvasError, TransformError)) else type(err).__name__


def main(argv=None):
    """Command-line entry point; returns the process exit code (non-zero on any failure)."""
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--fixtures")
    parser.add_argument("--write-fixtures", action="store_true", help="actually write fixture data to Redis (testing only)")
    parser.add_argument("--dump")
    args = parser.parse_args(argv)
    if args.fixtures and not args.write_fixtures:
        args.dry_run = True

    try:
        if args.fixtures:
            raw = load_fixtures(args.fixtures)
        else:
            client = CanvasClient(os.getenv("CANVAS_BASE_URL"), os.getenv("CANVAS_TOKEN"))
            if not os.getenv("CANVAS_COURSE_ID"):
                raise CanvasError("CANVAS_COURSE_ID is required")
            raw = fetch_course(client, os.environ["CANVAS_COURSE_ID"])
        total = os.getenv("CANVAS_TOTAL_POINTS")
        payload = build_payload(
            raw,
            include_future=_flag("CANVAS_INCLUDE_FUTURE"),
            release_on_due=_flag("CANVAS_RELEASE_ON_DUE"),
            total_points_override=float(total) if total else None,
            assignment_points_override=json.loads(os.getenv("CANVAS_ASSIGNMENT_POINTS") or "{}") or None,
            category_map=json.loads(os.getenv("CANVAS_CATEGORY_MAP") or "{}"),
        )
    except Exception as err:  # noqa: BLE001 - every failure is reported and exits non-zero
        print(f"Canvas import failed: {_describe(err)}", file=sys.stderr)
        if not args.dry_run:
            record_failure(_describe(err))
        return 1

    meta = payload["db2"]["canvas:sync_meta"]
    print(f"Canvas course {meta['course_id']}: {meta['students']} students, {meta['assignments_released']} released assignments, "
          f"{meta['assignments_held_back']} held back, {meta['unposted_scores_hidden']} unposted scores hidden, "
          f"{meta['excused_scores_omitted']} excused omitted, grading scheme: {meta['grading_scheme_source']}")
    for w in payload["warnings"]:
        print(f"  warning: {w}")
    if args.dump:
        fd = os.open(args.dump, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(payload, f, indent=1)
    if args.dry_run:
        return 0
    try:
        result = write_payload(payload, redis_clients(), expected_course_id=os.getenv("CANVAS_COURSE_ID"))
    except Exception as err:  # noqa: BLE001
        print(f"Redis write failed: {_describe(err)}", file=sys.stderr)
        record_failure(f"Redis write failed: {_describe(err)}")
        return 1
    print(f"Wrote {result['students_written']} students; removed {result['stale_removed']} stale keys")
    return 0


if __name__ == "__main__":
    sys.exit(main())
