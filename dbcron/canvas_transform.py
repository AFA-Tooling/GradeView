"""Turns raw Canvas data for one course into the exact Redis values GradeView reads today.

Pure functions only (no network, no Redis), so this can be unit-tested against saved fixtures.
The output mirrors update_db.py / update_bins.py:
  DB0  "Categories"  {category: {title: "max points as text"}}
       "MAX POINTS"  {"Legal Name": "MAX POINTS", "Assignments": {category: {title: number}}}
       "<email>"     {"Legal Name": "Last, First", "Assignments": {category: {title: number or ""}}}
  DB1  "bins"        {"bins": [{"letter", "points"} ascending], "assignment_points": {...}, "total_course_points": n}
  DB2  "canvas:admins", "canvas:sync_meta"   (new; DB2 is never flushed)

Grading policy (see CANVAS_IMPORTER.md):
  - An assignment counts in MAX POINTS only once at least one rostered student can see a score
    (or CANVAS_INCLUDE_FUTURE / CANVAS_RELEASE_ON_DUE opt-ins). Otherwise students would be
    scored 0 out of full points on work nobody can see yet.
  - Posted score -> number. Ungraded or graded-but-unposted -> "" (shown as blank / 0, like a
    blank sheet cell). Excused, or not assigned to that student -> title left out of that
    student's record, so it does not count against them (Canvas drops excused work too).
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone


class TransformError(Exception):
    """The Canvas data cannot be imported safely (for example a weighted course)."""


# Canvas's built-in scheme (GradingStandard.default_grading_scheme), used when grading_standard_id is 0.
CANVAS_DEFAULT_SCHEME = [
    {"name": "A", "value": 0.94}, {"name": "A-", "value": 0.90}, {"name": "B+", "value": 0.87},
    {"name": "B", "value": 0.84}, {"name": "B-", "value": 0.80}, {"name": "C+", "value": 0.77},
    {"name": "C", "value": 0.74}, {"name": "C-", "value": 0.70}, {"name": "D+", "value": 0.67},
    {"name": "D", "value": 0.64}, {"name": "D-", "value": 0.61}, {"name": "F", "value": 0.0},
]


def _parse_time(value):
    """Parses a Canvas ISO-8601 timestamp (Python 3.8 safe); returns None when empty."""
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _number(value):
    """Returns an int for whole numbers and a float otherwise, like gspread's numericise."""
    value = float(value)
    return int(value) if value.is_integer() else value


def _points(a):
    """Returns an assignment's points_possible as a float, treating null as 0."""
    return float(a.get("points_possible") or 0)


def build_payload(raw, now=None, include_future=False, release_on_due=False, total_points_override=None,
                  assignment_points_override=None, category_map=None):
    """Builds the Redis payload {"db0", "db1", "db2", "warnings"} for one course.

    raw: Canvas JSON from canvas_client.fetch_course (or saved fixtures).
    now: reference time for due dates (defaults to the current UTC time).
    include_future / release_on_due: opt-ins that add unreleased assignments to MAX POINTS.
    total_points_override / assignment_points_override: course total and per-group points for the bins.
    category_map: optional renames from Canvas assignment-group names to GradeView categories.
    Raises TransformError for courses that cannot be imported safely.
    """
    now = now or datetime.now(timezone.utc)
    category_map = category_map or {}
    course = raw["course"]
    warnings = []

    if course.get("apply_assignment_group_weights"):
        raise TransformError("Course uses weighted assignment groups; GradeView sums raw points, so v1 refuses to import it.")
    if course.get("restrict_quantitative_data"):
        raise TransformError("Course restricts quantitative data in Canvas (students see only letter grades); GradeView shows points, so v1 refuses to import it.")
    if course.get("hide_final_grades"):
        warnings.append("Course hides totals from students in Canvas; GradeView will still show running totals and letter-grade bins")

    groups = sorted(raw["assignment_groups"], key=lambda g: (g.get("position") or 0, g["id"]))
    group_name = {g["id"]: category_map.get(g["name"], g["name"]) for g in groups}
    group_order = {g["id"]: i for i, g in enumerate(groups)}

    # Only rostered (active) students count. The Test Student and concluded students are ignored,
    # so previewing in Student View cannot "release" an assignment early.
    roster_ids = {u["id"] for u in raw["students"]}
    subs = {}
    for entry in raw["submissions"]:
        if entry["user_id"] not in roster_ids:
            continue
        for s in entry.get("submissions", []):
            subs[(s["assignment_id"], entry["user_id"])] = s

    def is_posted_score(s):
        """True when a student can see this score in Canvas (scored, posted, not excused)."""
        return s is not None and s.get("score") is not None and s.get("posted_at") is not None and not s.get("excused")

    posted_by_assignment = {}
    for (aid, _), s in subs.items():
        if is_posted_score(s):
            posted_by_assignment.setdefault(aid, []).append(float(s["score"]))

    # Assignments that count: published, toward the final grade, graded, given to everyone.
    graded_all, counted = [], []
    for a in raw["assignments"]:
        if a.get("omit_from_final_grade") or a.get("grading_type") == "not_graded" or a["assignment_group_id"] not in group_name:
            continue
        if a.get("only_visible_to_overrides") or a.get("visible_to_everyone") is False:
            warnings.append(f"Skipped assignment {a['id']}: assigned only to specific students or sections")
            continue
        if _points(a) == 0 and not any(v > 0 for v in posted_by_assignment.get(a["id"], [])):
            warnings.append(f"Skipped assignment {a['id']}: no points possible and no extra credit posted")
            continue
        graded_all.append(a)
        if a.get("published"):
            counted.append(a)
    counted.sort(key=lambda a: (group_order[a["assignment_group_id"]], a.get("position") or 0, a["id"]))

    # "Released so far": at least one rostered student can see a score.
    released, past_due_unseen = [], 0
    for a in counted:
        due = _parse_time(a.get("due_at"))
        is_due = due is not None and due <= now
        if include_future or a["id"] in posted_by_assignment or (release_on_due and is_due):
            released.append(a)
        elif is_due:
            past_due_unseen += 1
    held_back = len(counted) - len(released)
    if held_back:
        warnings.append(f"{held_back} assignment(s) have no visible scores yet; left out of MAX POINTS")
    if past_due_unseen:
        warnings.append(f"{past_due_unseen} of them are past due (ungraded or grades hidden)")

    # Titles: unique course-wide, decided by lowest assignment id so they do not move between syncs.
    seen, title_of = Counter(), {}
    for a in sorted(counted, key=lambda a: a["id"]):
        raw_name = a["name"].strip()
        name = raw_name.replace("Summary", "summary")  # admin stats treat titles containing "Summary" specially
        if name != raw_name:
            warnings.append(f"Title of assignment {a['id']} contains 'Summary'; renamed to avoid the admin-stats summary rule")
        seen[name] += 1
        title_of[a["id"]] = f"{name} [{a['id']}]" if seen[name] > 1 else name
        if seen[name] > 1:
            warnings.append(f"Duplicate title renamed to '{title_of[a['id']]}'")

    categories, max_points = {}, {}
    for a in released:
        cat, title = group_name[a["assignment_group_id"]], title_of[a["id"]]
        categories.setdefault(cat, {})[title] = str(_number(_points(a)))
        max_points.setdefault(cat, {})[title] = _number(_points(a))

    db0 = {"Categories": categories, "MAX POINTS": {"Legal Name": "MAX POINTS", "Assignments": max_points}}

    email_counts = Counter((u.get("email") or "").strip().lower() for u in raw["students"])
    released_ids = {a["id"] for a in released}
    unposted = excused = no_email = collided = 0
    for u in raw["students"]:
        email = (u.get("email") or "").strip().lower()
        if not email:
            no_email += 1
            continue
        if email_counts[email] > 1:
            collided += 1  # fail closed: never serve one student's grades under a shared email
            continue
        record = {cat: {} for cat in categories}
        for a in counted:
            s = subs.get((a["id"], u["id"]))
            if s is not None and s.get("excused"):
                excused += 1
                continue
            if s is not None and s.get("score") is not None and s.get("posted_at") is None:
                unposted += 1
            if a["id"] not in released_ids or s is None:
                continue  # not released, or not assigned to this student
            record[group_name[a["assignment_group_id"]]][title_of[a["id"]]] = float(s["score"]) if is_posted_score(s) else ""
        db0[email] = {"Legal Name": u.get("sortable_name") or u.get("name") or "", "Assignments": record}
    if no_email:
        warnings.append(f"{no_email} student(s) without an email were skipped")
    if collided:
        warnings.append(f"{collided} student(s) share an email with another student; no grades written for them")

    group_points = {}
    for a in graded_all:
        cat = group_name[a["assignment_group_id"]]
        group_points[cat] = group_points.get(cat, 0) + _points(a)
    if assignment_points_override:
        group_points = {k: float(v) for k, v in assignment_points_override.items()}
    total = float(total_points_override or (sum(group_points.values()) if assignment_points_override else sum(_points(a) for a in counted)))
    if abs(sum(group_points.values()) - total) > 0.01:
        warnings.append("Assignment-group point totals do not add up to the course total; set CANVAS_ASSIGNMENT_POINTS or CANVAS_TOTAL_POINTS")

    db1 = {}
    source = raw.get("grading_standard_source") or ("course" if raw.get("grading_standard") else "none")
    scheme = (raw.get("grading_standard") or {}).get("grading_scheme") or []
    if not scheme and source == "canvas_default":
        scheme = CANVAS_DEFAULT_SCHEME
    if scheme:
        ordered = sorted(scheme, key=lambda r: r["value"])
        bins = []
        for i, row in enumerate(ordered):
            upper = ordered[i + 1]["value"] * total if i + 1 < len(ordered) else total
            bins.append({"letter": row["name"], "points": _number(round(upper, 2))})
        db1["bins"] = {
            "bins": bins,
            "assignment_points": {k: _number(round(v, 2)) for k, v in group_points.items()},
            "total_course_points": _number(round(total, 2)),
        }
    else:
        warnings.append(f"No usable grading scheme (source: {source}); bins left unchanged")

    # Admins: active Teacher/TA enrollments, excluding staff limited to their own section
    # (GradeView cannot scope admins to a section, so it fails closed).
    limited_ids = {e["user_id"] for e in raw.get("staff_enrollments", []) if e.get("limit_privileges_to_course_section")}
    student_emails = {e for e, n in email_counts.items() if e}
    admins = sorted({(u.get("email") or "").strip().lower() for u in raw["staff"]
                     if u.get("email") and u["id"] not in limited_ids})
    if limited_ids:
        warnings.append(f"{len(limited_ids)} section-limited staff member(s) left out of canvas:admins")
    if set(admins) & student_emails:
        warnings.append("Some staff are also enrolled as students in this course")

    synced_at = now.astimezone(timezone.utc).isoformat()
    db2 = {
        "canvas:admins": {"emails": admins, "course_id": course["id"], "synced_at": synced_at},
        "canvas:sync_meta": {
            "status": "warning" if collided else "ok",
            "course_id": course["id"],
            "synced_at": synced_at,
            "students": sum(1 for k in db0 if "@" in k),
            "assignments_released": len(released),
            "assignments_held_back": held_back,
            "unposted_scores_hidden": unposted,
            "excused_scores_omitted": excused,
            "grading_scheme_source": source,
            "warnings": warnings,
        },
    }
    return {"db0": db0, "db1": db1, "db2": db2, "warnings": warnings}
