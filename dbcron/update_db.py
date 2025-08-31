import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv
import json
import os
import redis

load_dotenv()

PORT = int(os.getenv("SERVER_PORT"))
SCOPES = json.loads(os.getenv("SPREADSHEET_SCOPES"))
HOST = os.getenv("SERVER_HOST")
DB = int(os.getenv("SERVER_DBINDEX"))
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")  # Fixed: Use SPREADSHEET_ID
SHEETNAME = os.getenv("SPREADSHEET_SHEETNAME")  # This is the sheet/tab name
WORKSHEET = int(os.getenv("SPREADSHEET_WORKSHEET"))
CATEGORYCOL = int(os.getenv("ASSIGNMENT_CATEGORYCOL"))
CATEGORYROW = int(os.getenv("ASSIGNMENT_CATEGORYROW"))
CONCEPTSCOL = int(os.getenv("ASSIGNMENT_CONCEPTSCOL"))
CONCEPTSROW = int(os.getenv("ASSIGNMENT_CONCEPTSROW"))
MAXPOINTSROW = int(os.getenv("ASSIGNMENT_MAXPOINTSROW"))
MAXPOINTSCOL = int(os.getenv("ASSIGNMENT_MAXPOINTSCOL"))
REDIS_PW = os.getenv("REDIS_DB_SECRET")

#needs both spreadsheet and drive access or else there is a permissions error, added as a viewer on the spreadsheet
credentials_json = os.getenv("SERVICE_ACCOUNT_CREDENTIALS")
credentials_dict = json.loads(credentials_json)
credentials = Credentials.from_service_account_info(credentials_dict, scopes=SCOPES)
client = gspread.authorize(credentials)

#redis setup
if HOST == "redis":  # If running in Docker
    redis_client = redis.Redis(host=HOST, port=PORT, db=DB, password=REDIS_PW)
else:  # If running locally
    redis_client = redis.Redis(host="localhost", port=6379, db=DB, password=REDIS_PW)

def update_redis():
    print(f"Attempting to open spreadsheet with ID: {SPREADSHEET_ID}")
    print(f"Looking for sheet/tab named: {SHEETNAME}")
    
    try:
        sheet = client.open_by_key(SPREADSHEET_ID).worksheet(SHEETNAME)
        print("Successfully opened spreadsheet!")
        
        categories = sheet.row_values(CATEGORYROW)[CATEGORYCOL:] #gets the categories from row 2, starting from column C
        concepts = sheet.row_values(CONCEPTSROW)[CONCEPTSCOL:] #gets the concepts from row 1, starting from column C
        max_points = sheet.row_values(MAXPOINTSROW)[MAXPOINTSCOL:] #gets the max points from row 3, starting from column C

        print(f"Found categories: {categories[:3]}...")  # Show first 3 categories
        print(f"Found concepts: {concepts[:3]}...")      # Show first 3 concepts

        category_scores = {}
        for category, concept, points in zip(categories, concepts, max_points):
            if category not in category_scores:
                category_scores[category] = {} #creates a hashmap entry for each category
            category_scores[category][concept] = points #nested hashmap of     category:concept:points

        redis_client.set("Categories", json.dumps(category_scores)) #the one record that holds all of the categories info

        records = sheet.get_all_records()
        print(f"Found {len(records)} student records")

        for record in records:
            email = record.pop('Email')
            legal_name = record.pop('Legal Name')
            if email == "CATEGORY":
                continue
            users_to_assignments = { #structure for db entries
                "Legal Name": legal_name,
                "Assignments": {}
            }

            for category, concept in zip(categories, concepts):
                if category not in users_to_assignments["Assignments"]:
                    users_to_assignments["Assignments"][category] = {}
                users_to_assignments["Assignments"][category][concept] = record[concept]

            redis_client.set(email, json.dumps(users_to_assignments)) #sets key value for user:other data
        
        print("Successfully updated Redis database!")
        
    except Exception as e:
        print(f"Error: {e}")
        print(f"Spreadsheet ID: {SPREADSHEET_ID}")
        print(f"Sheet name: {SHEETNAME}")
        raise

if __name__ == "__main__":
    update_redis()

