#!/usr/bin/env python3
# /dbcron/update_cm.py

import os, json
from dotenv import load_dotenv
import gspread
from google.oauth2.service_account import Credentials
import redis
import socket

load_dotenv()

# ─── Redis client ───────────────────────────────────────────────────────────────
def get_redis_url():
    try:
        socket.gethostbyname('redis')
        print("[info] Running inside Docker. Using redis:6379 with password")
        return "redis://:NciZ!4DfXxwAUNA@redis:6379"
    except socket.gaierror:
        print("[info] Running on Mac. Using localhost:6379 without password")
        return "redis://localhost:6379"

redis_url = get_redis_url()
r = redis.Redis.from_url(redis_url)


# ─── Google Sheets auth ────────────────────────────────────────────────────────
SCOPES    = json.loads(os.getenv("SPREADSHEET_SCOPES"))
CREDS     = json.loads(os.getenv("SERVICE_ACCOUNT_CREDENTIALS"))
creds     = Credentials.from_service_account_info(CREDS, scopes=SCOPES)
gc        = gspread.authorize(creds)

SS_ID     = os.getenv("SPREADSHEET_ID")
WSHEET    = int(os.getenv("CONCEPTMAP_WORKSHEET", 0))  # usually 0

def update_cm():
    # open the sheet and grab the two header rows
    sh     = gc.open_by_key(SS_ID)
    ws     = sh.get_worksheet(WSHEET)
    header = ws.row_values(1)  # Concept names: ["Legal Name","Email","Abstraction",...]
    catrow = ws.row_values(2)  # Category names: ["CATEGORY","CATEGORY","Quest",...]

    # skip the first two columns (Legal Name + Email)
    concept_names = header[2:]
    categories    = catrow[2:]

    # Build unique root nodes in order seen
    roots = []
    root_ids = {}
    next_id = 1

    for cat in categories:
        if cat not in root_ids:
            root_ids[cat] = next_id
            roots.append({
                "id": next_id,
                "parentId": None,
                "name": cat,
                "week": 1,   # default week; adjust if you embed week data
            })
            next_id += 1

    # Build child nodes
    children = []
    for idx, (name, cat) in enumerate(zip(concept_names, categories), start=1):
        cid = next_id
        children.append({
            "id": cid,
            "parentId": root_ids[cat],
            "name": name,
            "week": idx,  # or any mapping you choose
        })
        next_id += 1

    # Combine into one flat list
    outline_rows = roots + children

    # Write to Redis and notify
    r.set("outline:v1", json.dumps(outline_rows))
    r.publish("outline_updated", "1")
    print(f"[update_cm]  wrote {len(roots)} roots + {len(children)} children = {len(outline_rows)} nodes")

if __name__ == "__main__":
    update_cm()
