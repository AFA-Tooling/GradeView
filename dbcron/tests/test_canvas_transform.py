"""Tests for the Canvas -> Redis importer, using the local "GradeView Mock" course fixtures.

All fixture data is fake (@example.com users, replica-sheet scores). Edge cases E1-E12 are
described in the mock course README (gv_mock/README.md in the local canvas-lms checkout).
"""
import copy
import io
import json
import sys
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from canvas_client import CanvasClient, CanvasError, _rate_limit_low, fetch_grading_standard  # noqa: E402
from canvas_to_redis import load_fixtures, write_payload  # noqa: E402
from canvas_transform import TransformError, build_payload  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures" / "canvas_mock"
NOW = datetime(2026, 10, 1, 20, 0, tzinfo=timezone.utc)
REPLICA_GROUPS = ["Quest (pre-clobber)", "Midterm (pre-clobber)", "Postterm", "Projects", "Labs (before dropping lowest two)"]
LABS = "Labs (before dropping lowest two)"
PROJECT5, LAB8, EDGE_ALGORITHMS = 33, 40, 50


@pytest.fixture(scope="module")
def raw():
    return load_fixtures(FIXTURES)


@pytest.fixture(scope="module")
def payload(raw):
    return build_payload(raw, now=NOW, total_points_override=400)


def student(payload, n):
    return payload["db0"][f"mock.student{n:02d}@example.com"]


def titles(payload, cat):
    return set(payload["db0"]["Categories"].get(cat, {}))


# ---------- shape and roster ----------

def test_db0_has_only_categories_max_points_and_students(payload):
    keys = set(payload["db0"])
    assert {"Categories", "MAX POINTS"} <= keys
    others = keys - {"Categories", "MAX POINTS"}
    assert others and all("@" in k for k in others)


def test_roster_is_16_active_students(payload):  # E8, E11
    students = [k for k in payload["db0"] if "@" in k]
    assert len(students) == 16
    assert "mock.student17@example.com" not in students


def test_emails_are_lowercased(payload):  # E12
    assert "mock.student07@example.com" in payload["db0"]
    assert not any(k != k.lower() for k in payload["db0"] if "@" in k)


def test_shapes_match_update_db(payload):
    mp = payload["db0"]["MAX POINTS"]
    assert mp["Legal Name"] == "MAX POINTS"
    cats = payload["db0"]["Categories"]
    assert list(cats)[:5] == REPLICA_GROUPS
    assert cats["Projects"]["Project 2: Spelling Bee"] == "25"  # text, like a sheet cell
    assert mp["Assignments"]["Projects"]["Project 2: Spelling Bee"] == 25  # number
    s = student(payload, 2)
    assert s["Legal Name"] == "Testwell, Ben"
    assert set(s["Assignments"]) == set(cats)  # every category key present, like the sheet path
    for cat, ts in cats.items():
        assert set(s["Assignments"][cat]) == set(ts)


def test_posted_scores_are_numbers(payload):
    s = student(payload, 2)["Assignments"]
    assert s["Quest (pre-clobber)"]["Abstraction"] == 2.0
    assert s["Projects"]["Project 4: Explore"] == 15.0


# ---------- release rule (review C1/G1) ----------

def test_assignment_with_no_visible_scores_is_held_back(payload):  # E1
    assert "Project 5: Final Project" not in titles(payload, "Projects")
    assert "Project 5: Final Project" not in payload["db0"]["MAX POINTS"]["Assignments"]["Projects"]
    for n in range(1, 17):
        assert "Project 5: Final Project" not in student(payload, n)["Assignments"]["Projects"]
    meta = payload["db2"]["canvas:sync_meta"]
    assert meta["assignments_held_back"] == 1
    assert meta["unposted_scores_hidden"] == 16


def test_release_on_due_opt_in_shows_blank(raw):
    p = build_payload(raw, now=NOW, total_points_override=400, release_on_due=True)
    assert student(p, 1)["Assignments"]["Projects"]["Project 5: Final Project"] == ""


def test_released_once_one_rostered_student_can_see_a_score(raw):
    r = copy.deepcopy(raw)
    first = next(e for e in r["submissions"] if e["user_id"] == r["students"][0]["id"])
    sub = next(s for s in first["submissions"] if s["assignment_id"] == PROJECT5)
    sub["posted_at"] = "2026-09-25T00:00:00Z"
    p = build_payload(r, now=NOW, total_points_override=400)
    assert "Project 5: Final Project" in titles(p, "Projects")
    values = [p["db0"][k]["Assignments"]["Projects"]["Project 5: Final Project"] for k in p["db0"] if "@" in k]
    assert values.count("") == 15 and sum(isinstance(v, float) for v in values) == 1


def test_non_roster_users_cannot_release_an_assignment(raw):  # review G3 (Test Student, concluded)
    r = copy.deepcopy(raw)
    r["submissions"].append({"user_id": 99999, "submissions": [
        {"assignment_id": PROJECT5, "score": 60.0, "posted_at": "2026-09-25T00:00:00Z", "excused": False}]})
    p = build_payload(r, now=NOW, total_points_override=400)
    assert "Project 5: Final Project" not in titles(p, "Projects")


# ---------- per-student states ----------

def test_excused_is_left_out_of_that_students_record(payload):  # E2, review C2/G2
    assert "Lab 8: Boards" not in student(payload, 3)["Assignments"][LABS]
    assert student(payload, 4)["Assignments"][LABS]["Lab 8: Boards"] == 2.0
    assert payload["db2"]["canvas:sync_meta"]["excused_scores_omitted"] == 1


def test_ungraded_is_blank(payload):  # E3
    assert student(payload, 5)["Assignments"][LABS]["Lab 18: Data Science"] == ""


def test_assignment_for_specific_students_is_skipped(raw):  # review S5/G4
    r = copy.deepcopy(raw)
    for a in r["assignments"]:
        if a["id"] == LAB8:
            a["only_visible_to_overrides"] = True
    p = build_payload(r, now=NOW, total_points_override=400)
    assert "Lab 8: Boards" not in titles(p, LABS)
    assert any(f"Skipped assignment {LAB8}" in w for w in p["warnings"])


def test_zero_point_extra_credit_is_kept_only_when_posted(raw):  # review C5/G6
    r = copy.deepcopy(raw)
    for a in r["assignments"]:
        if a["id"] == EDGE_ALGORITHMS:
            a["points_possible"] = 0
    p = build_payload(r, now=NOW, total_points_override=400)
    assert any(t.startswith("Algorithms [") for t in titles(p, "Edge Cases (mock only)"))  # posted 2.0 extra credit
    for e in r["submissions"]:
        for s in e["submissions"]:
            if s["assignment_id"] == EDGE_ALGORITHMS:
                s["score"] = 0.0
    p2 = build_payload(r, now=NOW, total_points_override=400)
    assert not any(t.startswith("Algorithms [") for t in titles(p2, "Edge Cases (mock only)"))


def test_duplicate_student_emails_fail_closed(raw):  # review S7
    r = copy.deepcopy(raw)
    r["students"][1]["email"] = r["students"][0]["email"].upper()
    p = build_payload(r, now=NOW, total_points_override=400)
    assert r["students"][0]["email"].lower() not in p["db0"]
    assert p["db2"]["canvas:sync_meta"]["status"] == "warning"


# ---------- titles ----------

def test_duplicate_title_lowest_id_keeps_plain_name(payload):  # E4, review G7
    all_titles = [t for g in payload["db0"]["Categories"].values() for t in g]
    assert len(all_titles) == len(set(all_titles))
    assert "Algorithms" in titles(payload, "Midterm (pre-clobber)")
    assert f"Algorithms [{EDGE_ALGORITHMS}]" in titles(payload, "Edge Cases (mock only)")


def test_summary_in_title_is_renamed(payload):  # E5, review C3
    all_titles = [t for g in payload["db0"]["Categories"].values() for t in g]
    assert not any("Summary" in t for t in all_titles)
    assert "Weekly summary Reflection" in titles(payload, "Edge Cases (mock only)")


def test_excluded_assignment_types(payload):  # E6, E7
    edge = titles(payload, "Edge Cases (mock only)")
    assert "Practice Quiz (not counted)" not in edge
    assert all("Future Lab" not in t for g in payload["db0"]["Categories"].values() for t in g)
    assert sum(len(titles(payload, g)) for g in REPLICA_GROUPS) == 48  # 49 replica columns minus held-back Project 5


# ---------- bins ----------

def test_bins_ascending_upper_bounds_ending_at_total(payload):
    b = payload["db1"]["bins"]
    assert [x["letter"] for x in b["bins"]] == ["F", "D", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"]
    assert [x["points"] for x in b["bins"]] == [250, 290, 300, 310, 320, 330, 350, 360, 370, 390, 400]
    assert b["total_course_points"] == 400


def test_canvas_default_scheme_when_id_is_zero(raw):  # review B2
    r = dict(raw, grading_standard=None, grading_standard_source="canvas_default")
    p = build_payload(r, now=NOW, total_points_override=100)
    letters = [x["letter"] for x in p["db1"]["bins"]["bins"]]
    assert letters[0] == "F" and letters[-1] == "A" and len(letters) == 12
    assert p["db1"]["bins"]["bins"][-1]["points"] == 100


def test_assignment_points_override_and_mismatch_warning(raw):  # review C4
    p = build_payload(raw, now=NOW, assignment_points_override={"Labs": 40, "Projects": 160})
    assert p["db1"]["bins"]["assignment_points"] == {"Labs": 40, "Projects": 160}
    assert p["db1"]["bins"]["total_course_points"] == 200
    p2 = build_payload(raw, now=NOW, total_points_override=400)
    assert any("do not add up" in w for w in p2["warnings"])


# ---------- admins ----------

def test_admins_exclude_designer_and_section_limited_staff(payload):  # E9, E10, review S4
    assert payload["db2"]["canvas:admins"]["emails"] == ["mock.ta1@example.com", "mock.teacher@example.com"]
    assert any("section-limited" in w for w in payload["warnings"])


# ---------- course-level refusals ----------

def test_weighted_course_is_refused(raw):
    with pytest.raises(TransformError):
        build_payload(dict(raw, course=dict(raw["course"], apply_assignment_group_weights=True)), now=NOW)


def test_restricted_quantitative_data_is_refused_and_hidden_totals_warn(raw):  # review S6
    with pytest.raises(TransformError):
        build_payload(dict(raw, course=dict(raw["course"], restrict_quantitative_data=True)), now=NOW)
    p = build_payload(dict(raw, course=dict(raw["course"], hide_final_grades=True)), now=NOW)
    assert any("hides totals" in w for w in p["warnings"])


def test_payload_is_json_serializable(payload):
    json.dumps(payload)


# ---------- Redis write path ----------

class FakeRedis:
    def __init__(self, store, db):
        self.store, self.db = store, db

    def set(self, k, v):
        self.store[(self.db, k if isinstance(k, str) else k.decode())] = v

    def get(self, k):
        return self.store.get((self.db, k))

    def delete(self, *keys):
        for k in keys:
            self.store.pop((self.db, k.decode() if isinstance(k, bytes) else k), None)

    def scan_iter(self, match="*"):
        return [k.encode() for (d, k) in list(self.store) if d == self.db and "@" in k]

    def pipeline(self, transaction=True):
        outer = self

        class P:
            def __init__(self):
                self.ops = []

            def set(self, k, v):
                self.ops.append((k, v))

            def execute(self):
                for k, v in self.ops:
                    outer.set(k, v)
        return P()


def fake_clients():
    store = {}
    return store, {"db0": FakeRedis(store, 0), "db1": FakeRedis(store, 1), "db2": FakeRedis(store, 2)}


def test_write_upserts_and_prunes_only_departed_students(payload):
    store, clients = fake_clients()
    store[(0, "gone@example.com")] = "{}"
    store[(0, "MAX POINTS")] = "old"
    result = write_payload(payload, clients, expected_course_id=payload["db2"]["canvas:sync_meta"]["course_id"])
    assert result == {"students_written": 16, "stale_removed": 1}
    assert (0, "gone@example.com") not in store
    assert json.loads(store[(0, "MAX POINTS")])["Legal Name"] == "MAX POINTS"
    assert (1, "bins") in store and (2, "canvas:admins") in store and (2, "canvas:sync_meta") in store


def test_write_refuses_wrong_course_and_empty_roster(payload):
    _, clients = fake_clients()
    with pytest.raises(TransformError):
        write_payload(payload, clients, expected_course_id="999")
    empty = copy.deepcopy(payload)
    empty["db0"] = {k: v for k, v in empty["db0"].items() if "@" not in k}
    with pytest.raises(TransformError):
        write_payload(empty, clients)


# ---------- command line ----------


@pytest.fixture
def clean_canvas_env(monkeypatch):
    for name in ("CANVAS_COURSE_ID", "CANVAS_TOTAL_POINTS", "CANVAS_ASSIGNMENT_POINTS", "CANVAS_CATEGORY_MAP",
                 "CANVAS_INCLUDE_FUTURE", "CANVAS_RELEASE_ON_DUE"):
        monkeypatch.delenv(name, raising=False)


def test_main_no_dotenv_skips_env_files(monkeypatch, capsys, clean_canvas_env):
    # make mock-up passes --no-dotenv, so CANVAS_* settings in a developer's dbcron/.env
    # (for example CANVAS_COURSE_ID) cannot change or block the fake-data load.
    import canvas_to_redis

    def must_not_run(*_args, **_kwargs):
        raise AssertionError("load_dotenv() ran despite --no-dotenv")

    monkeypatch.setattr(canvas_to_redis, "load_dotenv", must_not_run)
    assert canvas_to_redis.main(["--fixtures", str(FIXTURES), "--no-dotenv"]) == 0
    assert "16 students" in capsys.readouterr().out


def test_main_loads_dotenv_by_default(monkeypatch, clean_canvas_env):
    import canvas_to_redis

    calls = []
    monkeypatch.setattr(canvas_to_redis, "load_dotenv", lambda *a, **k: calls.append(True))
    assert canvas_to_redis.main(["--fixtures", str(FIXTURES)]) == 0
    assert calls == [True]


# ---------- client safety (review B1/B4/B6/S1/S2) ----------

def test_client_rejects_bad_tokens_and_plain_http():
    with pytest.raises(CanvasError):
        CanvasClient("https://bcourses.berkeley.edu", "abc def")
    with pytest.raises(CanvasError):
        CanvasClient("http://bcourses.berkeley.edu", "token")
    CanvasClient("http://localhost:8080", "  token\n")  # local mock allowed; surrounding whitespace stripped


def test_client_refuses_links_to_another_origin():
    c = CanvasClient("https://bcourses.berkeley.edu", "token", sleep=lambda s: None)
    with pytest.raises(CanvasError):
        c._request("https://evil.example.com/api/v1/courses")


class _Resp(io.BytesIO):
    def __init__(self, body, headers=None):
        super().__init__(json.dumps(body).encode())
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_client_retries_5xx_and_timeouts_then_succeeds():
    c = CanvasClient("https://bcourses.berkeley.edu", "token", sleep=lambda s: None)
    calls = []

    class Opener:
        def open(self, req, timeout=None):
            calls.append(1)
            if len(calls) == 1:
                raise urllib.error.HTTPError(req.full_url, 503, "busy", {}, io.BytesIO(b""))
            if len(calls) == 2:
                raise TimeoutError("read timed out")
            return _Resp([{"id": 1}], {"Link": ""})
    c._opener = Opener()
    assert c.get_all("/courses/1/users") == [{"id": 1}]
    assert len(calls) == 3


def test_client_reports_non_json_as_canvas_error():
    c = CanvasClient("https://bcourses.berkeley.edu", "token", sleep=lambda s: None)

    class Opener:
        def open(self, req, timeout=None):
            r = _Resp({})
            r.seek(0)
            r.truncate()
            r.write(b"<html>maintenance</html>")
            r.seek(0)
            return r
    c._opener = Opener()
    with pytest.raises(CanvasError):
        c.get("/courses/1")


def test_rate_limit_header_parsing():
    assert _rate_limit_low("10") is True
    assert _rate_limit_low("700") is False
    assert _rate_limit_low(None) is False
    assert _rate_limit_low("not-a-number") is False


def test_grading_standard_falls_back_from_course_to_account():
    class Client:
        def get(self, path):
            if path.startswith("/courses/"):
                raise CanvasError("HTTP 404")
            return {"id": 7, "grading_scheme": [{"name": "A", "value": 0.9}]}

    standard, source = fetch_grading_standard(Client(), {"id": 1, "account_id": 3, "grading_standard_id": 7})
    assert source == "account" and standard["id"] == 7
    assert fetch_grading_standard(Client(), {"id": 1, "grading_standard_id": 0}) == (None, "canvas_default")
    assert fetch_grading_standard(Client(), {"id": 1, "grading_standard_id": None}) == (None, "none")
