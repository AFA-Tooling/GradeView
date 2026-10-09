"""Tests for the Google Sheet -> Redis job (update_db.py / sheet_transform.py) with fake rows.

No network, Google credentials or Redis: the sheet, the Google client and Redis are replaced by fakes, and
dotenv is stubbed so a local dbcron/.env is never read. All names and emails are made up.
"""
import copy
import importlib
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sheet_transform import build_student_entries, normalize_email, roster_key  # noqa: E402

HEADER = ["Legal Name", "Email", "Abstraction", "Iteration", "Booleans"]
CATEGORIES = ["Quest 1", "Quest 1", "Lab 1"]
CONCEPTS = HEADER[2:]


def rows_to_records(rows):
    """What gspread's get_all_records() returns: one dict per row, keyed by the header row."""
    return [dict(zip(HEADER, row)) for row in rows]


FAKE_ROWS = [
    ["CATEGORY", "CATEGORY", *CATEGORIES],
    ["MAX POINTS", "MAX POINTS", 2, 6, 6],
    ["Student, One", "  Student01@Berkeley.EDU ", 2, 5, 6],
    ["Student, Two", "student02@berkeley.edu", 1, 6, 4],
    ["Student, Three", "Student03@berkeley.edu", 2, 2, 2],
    ["Student, Three (copy)", " student03@BERKELEY.edu", 0, 0, 0],
    ["", "", "", "", ""],
]


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Student01@Berkeley.EDU", "student01@berkeley.edu"),
        ("  student02@berkeley.edu\t", "student02@berkeley.edu"),
        ("student03@berkeley.edu", "student03@berkeley.edu"),
        ("", ""),
        (None, ""),
    ],
)
def test_normalize_email_trims_and_lowercases(raw, expected):
    assert normalize_email(raw) == expected


def test_normalize_email_matches_the_canvas_importer_and_the_api():
    # canvas_transform.py: (u.get("email") or "").strip().lower(); the API lowercases the Google email.
    raw = " Mock.Student01@Example.COM "
    assert normalize_email(raw) == raw.strip().lower() == "mock.student01@example.com"


@pytest.mark.parametrize("special", ["MAX POINTS", "CATEGORY", "Categories"])
def test_roster_key_keeps_rows_that_are_not_emails(special):
    assert roster_key(special) == special


def test_build_student_entries_normalizes_student_keys():
    entries, _ = build_student_entries(rows_to_records(FAKE_ROWS), CATEGORIES, CONCEPTS, "Legal Name")

    assert "student01@berkeley.edu" in entries
    assert "student02@berkeley.edu" in entries
    assert not any(k != k.strip().lower() for k in entries if "@" in k)
    assert entries["student01@berkeley.edu"] == {
        "Legal Name": "Student, One",
        "Assignments": {"Quest 1": {"Abstraction": 2, "Iteration": 5}, "Lab 1": {"Booleans": 6}},
    }


def test_build_student_entries_keeps_max_points_and_skips_category():
    entries, _ = build_student_entries(rows_to_records(FAKE_ROWS), CATEGORIES, CONCEPTS, "Legal Name")

    # The API reads this row with GET "MAX POINTS" (lib/redisHelper.mjs).
    assert entries["MAX POINTS"] == {
        "Legal Name": "MAX POINTS",
        "Assignments": {"Quest 1": {"Abstraction": 2, "Iteration": 6}, "Lab 1": {"Booleans": 6}},
    }
    assert "max points" not in entries
    assert "CATEGORY" not in entries and "category" not in entries


def test_build_student_entries_fails_closed_on_emails_that_collide():
    entries, warnings = build_student_entries(rows_to_records(FAKE_ROWS), CATEGORIES, CONCEPTS, "Legal Name")

    # Two rows normalize to student03@berkeley.edu: neither row's grades may be served under it.
    assert not any("student03" in k.lower() for k in entries)
    assert any("2 student row(s) share an email" in w for w in warnings)


def test_build_student_entries_skips_rows_without_an_email():
    entries, warnings = build_student_entries(rows_to_records(FAKE_ROWS), CATEGORIES, CONCEPTS, "Legal Name")

    assert "" not in entries
    assert any("1 row(s) without an email" in w for w in warnings)
    assert sorted(entries) == ["MAX POINTS", "student01@berkeley.edu", "student02@berkeley.edu"]


def test_build_student_entries_does_not_modify_the_rows():
    records = rows_to_records(FAKE_ROWS)
    before = copy.deepcopy(records)

    build_student_entries(records, CATEGORIES, CONCEPTS, "Legal Name")

    assert records == before


# --- update_db.update_redis() end to end, offline -------------------------------------------------

class FakeSheet:
    def __init__(self, rows):
        self.rows = rows  # row 1 is the header

    def row_values(self, row):
        return list(self.rows[row - 1])

    def get_all_records(self):
        return [dict(zip(self.rows[0], r)) for r in self.rows[1:]]


class FakeGoogleClient:
    def __init__(self, sheet):
        self.sheet = sheet

    def open_by_key(self, _key):
        return self

    def worksheet(self, _name):
        return self.sheet


class FakeRedis:
    def __init__(self, *args, **kwargs):
        self.store = {}

    def set(self, key, value):
        self.store[key] = value


FAKE_ENV = {
    "SERVER_HOST": "localhost",
    "SERVER_PORT": "6379",
    "SERVER_DBINDEX": "0",
    "REDIS_DB_SECRET": "fake-password",
    "SPREADSHEET_ID": "fake-spreadsheet-id",
    "SPREADSHEET_SHEETNAME": "Fake Grades",
    "SPREADSHEET_WORKSHEET": "0",
    "SPREADSHEET_SCOPES": '["https://www.googleapis.com/auth/spreadsheets.readonly"]',
    "SERVICE_ACCOUNT_CREDENTIALS": "{}",
    "ASSIGNMENT_CONCEPTSROW": "1",
    "ASSIGNMENT_CONCEPTSCOL": "2",
    "ASSIGNMENT_CATEGORYROW": "2",
    "ASSIGNMENT_CATEGORYCOL": "2",
    "ASSIGNMENT_MAXPOINTSROW": "3",
    "ASSIGNMENT_MAXPOINTSCOL": "2",
}


@pytest.fixture
def update_db(monkeypatch):
    """Imports update_db.py against a fake sheet and a fake Redis, without credentials or network."""
    import dotenv
    import gspread
    import redis
    from google.oauth2 import service_account

    for name, value in FAKE_ENV.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: False)
    monkeypatch.setattr(service_account.Credentials, "from_service_account_info", lambda *a, **k: object())
    monkeypatch.setattr(gspread, "authorize", lambda _creds: FakeGoogleClient(FakeSheet([HEADER, *FAKE_ROWS])))
    monkeypatch.setattr(redis, "Redis", FakeRedis)
    sys.modules.pop("update_db", None)
    module = importlib.import_module("update_db")
    yield module
    sys.modules.pop("update_db", None)


def test_update_redis_writes_normalized_student_keys(update_db, capsys):
    update_db.update_redis()

    store = update_db.redis_client.store
    assert sorted(store) == ["Categories", "MAX POINTS", "student01@berkeley.edu", "student02@berkeley.edu"]
    assert json.loads(store["student01@berkeley.edu"])["Legal Name"] == "Student, One"
    assert json.loads(store["MAX POINTS"])["Legal Name"] == "MAX POINTS"

    out = capsys.readouterr().out
    assert "updated Redis database with 2 student records" in out
    assert "share an email" in out
    assert "student03" not in out.lower()  # warnings give counts, not student emails
