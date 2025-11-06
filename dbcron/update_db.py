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
        
        # Determine the name column - try multiple strategies
        # get_all_records() uses the first row as headers, so check what keys we have
        if len(records) == 0:
            raise ValueError("No records found in spreadsheet")
        
        # Get the available column keys from the first record
        available_keys = list(records[0].keys())
        print(f"Available columns: {available_keys[:5]}...")  # Show first 5 columns
        
        name_column_key = None
        
        # Strategy 1: Check if 'Legal Name' exists
        if 'Legal Name' in available_keys:
            name_column_key = 'Legal Name'
        # Strategy 2: Check for empty string (common when column A has no header)
        elif '' in available_keys and available_keys[0] == '':
            name_column_key = ''
            print("Found empty header in first column, assuming it's the name column")
        # Strategy 3: Use the first column as fallback (before Email)
        elif len(available_keys) > 0:
            # Find Email column index
            email_index = available_keys.index('Email') if 'Email' in available_keys else -1
            # If Email is in column B (index 1), then column A (index 0) is likely the name
            if email_index == 1:
                name_column_key = available_keys[0]
                print(f"Warning: 'Legal Name' column not found. Using first column '{name_column_key}' as name column.")
            else:
                # Last resort: use first column
                name_column_key = available_keys[0]
                print(f"Warning: 'Legal Name' column not found. Using first column '{name_column_key}' as name column.")
        
        if name_column_key is None:
            raise ValueError("Could not determine name column. Please ensure the spreadsheet has a name column in the first column.")

        for record in records:
            email = record.pop('Email')
            # Safely get the legal name using the determined key
            legal_name = record.pop(name_column_key, None)
            if legal_name is None:
                # Last resort: try to get from first column by index
                first_col_value = list(record.values())[0] if record else None
                legal_name = first_col_value or "Unknown"
                print(f"Warning: Could not extract name for email {email}, using '{legal_name}'")
            
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

