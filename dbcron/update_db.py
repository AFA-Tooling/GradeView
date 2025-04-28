import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv
import json
import os
import redis
import socket

load_dotenv()

PORT = int(os.getenv("SERVER_PORT"))
SCOPES = json.loads(os.getenv("SPREADSHEET_SCOPES"))
HOST = os.getenv("SERVER_HOST")
DB = int(os.getenv("SERVER_DBINDEX"))
SHEETNAME = os.getenv("SPREADSHEET_SHEETNAME")
WORKSHEET = int(os.getenv("SPREADSHEET_WORKSHEET"))
CM_WSHEET   = int(os.getenv("CONCEPTMAP_WORKSHEET"))
CATEGORYCOL = int(os.getenv("ASSIGNMENT_CATEGORYCOL"))
CATEGORYROW = int(os.getenv("ASSIGNMENT_CATEGORYROW"))
CONCEPTSCOL = int(os.getenv("ASSIGNMENT_CONCEPTSCOL"))
CONCEPTSROW = int(os.getenv("ASSIGNMENT_CONCEPTSROW"))
MAXPOINTSROW = int(os.getenv("ASSIGNMENT_MAXPOINTSROW"))
MAXPOINTSCOL = int(os.getenv("ASSIGNMENT_MAXPOINTSCOL"))
REDIS_PW = os.getenv("REDIS_DB_SECRET")

# needs both spreadsheet and drive access
credentials_json = os.getenv("SERVICE_ACCOUNT_CREDENTIALS")
credentials_dict = json.loads(credentials_json)
credentials = Credentials.from_service_account_info(credentials_dict, scopes=SCOPES)
client = gspread.authorize(credentials)

# redis setup
def get_redis_url():
    try:
        socket.gethostbyname('redis')
        print("[info] Running inside Docker. Using redis:6379 with password")
        return "redis://:NciZ!4DfXxwAUNA@redis:6379"
    except socket.gaierror:
        print("[info] Running on Mac. Using localhost:6379 without password")
        return "redis://localhost:6379"


# Actually connect
redis_url = get_redis_url()
redis_client = redis.Redis.from_url(redis_url)

def normalize_name(s):
    return s.strip().lower()

def update_redis():
    sheet = client.open(SHEETNAME).get_worksheet(WORKSHEET)
    categories = [c.strip() for c in sheet.row_values(CATEGORYROW)[CATEGORYCOL:]]
    concepts = [c.strip() for c in sheet.row_values(CONCEPTSROW)[CONCEPTSCOL:]]
    max_points = [p.strip() for p in sheet.row_values(MAXPOINTSROW)[MAXPOINTSCOL:]]

    category_scores = {}
    for category, concept, points in zip(categories, concepts, max_points):
        cat = normalize_name(category)
        con = normalize_name(concept)
        if cat not in category_scores:
            category_scores[cat] = {}
        category_scores[cat][con] = int(points) if (points is not None and str(points).strip().isdigit()) else 0

    redis_client.set("Categories", json.dumps(category_scores))

    records = sheet.get_all_records()

    # --- Create all students ---
    for record in records:
        email = record.pop('Email')
        legal_name = record.pop('Legal Name')
        if email == "CATEGORY":
            continue

        users_to_assignments = {
            "Legal Name": legal_name,
            "Assignments": {}
        }

        for category, concept in zip(categories, concepts):
            cat = normalize_name(category)
            con = normalize_name(concept)
            if cat not in users_to_assignments["Assignments"]:
                users_to_assignments["Assignments"][cat] = {}
            value = record.get(concept)
            users_to_assignments["Assignments"][cat][con] = int(value) if (value is not None and str(value).strip().isdigit()) else 0

        redis_client.set(email, json.dumps(users_to_assignments))

    # --- Create MAX POINTS fake student ---
    max_points_student = {
        "Legal Name": "MAX POINTS",
        "Assignments": {}
    }

    for category, concept, points in zip(categories, concepts, max_points):
        cat = normalize_name(category)
        con = normalize_name(concept)
        if cat not in max_points_student["Assignments"]:
            max_points_student["Assignments"][cat] = {}
        max_points_student["Assignments"][cat][con] = int(points) if (points is not None and str(points).strip().isdigit()) else 0

    redis_client.set("MAX POINTS", json.dumps(max_points_student))

if __name__ == "__main__":
    update_redis()
