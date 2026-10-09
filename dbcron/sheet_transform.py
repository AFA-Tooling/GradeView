"""Pure helpers for update_db.py: turn Google Sheet rows into the DB0 entries the API reads.

Nothing here talks to Google Sheets or Redis or needs credentials, so the tests can run it on fake rows.
"""
from collections import Counter


def normalize_email(value):
    """A student email as a Redis key: surrounding spaces removed, lowercased.

    The API lowercases the signed-in Google email before it looks the student up, and the Canvas importer
    (canvas_transform.py) writes its keys the same way.
    """
    return ("" if value is None else str(value)).strip().lower()


def roster_key(value):
    """The DB0 key for a row's Email cell.

    Student emails (anything with an "@") are normalized. Other rows keep their exact key, because the API reads
    them by name: the "MAX POINTS" row is stored as "MAX POINTS", never "max points".
    """
    text = "" if value is None else str(value)
    return normalize_email(text) if "@" in text else text


def build_student_entries(records, categories, concepts, name_column_key):
    """Maps sheet rows (gspread get_all_records() dicts) to {DB0 key: entry}. Returns (entries, warnings).

    Skips the "CATEGORY" row and rows without an email. Students whose emails are the same once normalized
    get no entry at all (fail closed, as canvas_transform.py does), so one student's grades are never served
    under another student's key. The rows passed in are not modified.
    """
    email_counts = Counter(k for k in (roster_key(r.get("Email")) for r in records) if "@" in k)
    entries = {}
    no_email = shared = 0

    for row in records:
        record = dict(row)
        key = roster_key(record.pop("Email"))
        # Safely get the legal name using the determined key
        legal_name = record.pop(name_column_key, None)
        if legal_name is None:
            # Last resort: try to get from first column by index
            first_col_value = list(record.values())[0] if record else None
            legal_name = first_col_value or "Unknown"

        if key == "CATEGORY":
            continue
        if not key.strip():
            no_email += 1
            continue
        if email_counts[key] > 1:
            shared += 1
            continue

        assignments = {}
        for category, concept in zip(categories, concepts):
            assignments.setdefault(category, {})[concept] = record[concept]
        entries[key] = {"Legal Name": legal_name, "Assignments": assignments}

    warnings = []
    if no_email:
        warnings.append(f"{no_email} row(s) without an email were skipped")
    if shared:
        warnings.append(
            f"{shared} student row(s) share an email with another row (ignoring case and spaces); "
            "no grades written for them"
        )
    return entries, warnings
