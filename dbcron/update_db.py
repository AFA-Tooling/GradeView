import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv
import json
import os
import redis

from sheet_transform import build_student_entries

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
    try:
        sheet = client.open_by_key(SPREADSHEET_ID).worksheet(SHEETNAME)
        
        categories = sheet.row_values(CATEGORYROW)[CATEGORYCOL:] #gets the categories from row 2, starting from column C
        concepts = sheet.row_values(CONCEPTSROW)[CONCEPTSCOL:] #gets the concepts from row 1, starting from column C
        max_points = sheet.row_values(MAXPOINTSROW)[MAXPOINTSCOL:] #gets the max points from row 3, starting from column C

        category_scores = {}
        for category, concept, points in zip(categories, concepts, max_points):
            if category not in category_scores:
                category_scores[category] = {} #creates a hashmap entry for each category
            category_scores[category][concept] = points #nested hashmap of     category:concept:points

        redis_client.set("Categories", json.dumps(category_scores)) #the one record that holds all of the categories info

        # VALIDATION: Check spreadsheet structure
        validation_warnings = []
        validation_errors = []
        
        # Check header row structure
        header_row = sheet.row_values(1)  # Row 1 is header for get_all_records()
        
        # Validate column structure per README requirements
        # Check: First column should be student name (can be empty header)
        if len(header_row) > 0:
            first_col = header_row[0] if header_row[0] else "(empty)"
            if first_col and first_col != "Legal Name" and first_col.strip() != "":
                validation_warnings.append(f"First column header is '{first_col}' (expected empty or 'Legal Name')")
        else:
            validation_errors.append("No columns found in header row")
        
        # Check: Second column should be Email
        if len(header_row) > 1:
            second_col = header_row[1] if len(header_row) > 1 else None
            if second_col != "Email":
                validation_errors.append(f"Second column should be 'Email', found: '{second_col}'")
        else:
            validation_errors.append("Second column (Email) not found")
        
        # Validate max points are numeric
        max_points_numeric = all(
            str(val).replace('.', '').isdigit() or val == '' 
            for val in max_points[:10]  # Check first 10
        )
        if not max_points_numeric:
            validation_warnings.append("Some values in max points row may not be numeric")
        
        # Check categories and concepts
        if len(categories) == 0 or len(concepts) == 0:
            validation_warnings.append(f"Found {len(categories)} categories and {len(concepts)} concepts (expected > 0)")
        
        records = sheet.get_all_records()
        
        # Determine the name column - try multiple strategies
        # get_all_records() uses the first row as headers, so check what keys we have
        if len(records) == 0:
            validation_errors.append("No student records found in spreadsheet")
            raise ValueError("No records found in spreadsheet")
        
        # Get the available column keys from the first record
        available_keys = list(records[0].keys())
        
        # Print validation results (only errors and warnings)
        if validation_errors:
            print("\n" + "="*60)
            print("VALIDATION ERRORS (must be fixed):")
            print("="*60)
            for error in validation_errors:
                print(f"  ❌ {error}")
            print("="*60 + "\n")
        
        if validation_warnings:
            print("\n" + "="*60)
            print("VALIDATION WARNINGS (should be reviewed):")
            print("="*60)
            for warning in validation_warnings:
                print(f"  ⚠️  {warning}")
            print("="*60 + "\n")
        
        name_column_key = None
        
        # Strategy 1: Check if 'Legal Name' exists
        if 'Legal Name' in available_keys:
            name_column_key = 'Legal Name'
        # Strategy 2: Check for empty string (common when column A has no header)
        elif '' in available_keys and available_keys[0] == '':
            name_column_key = ''
        # Strategy 3: Use the first column as fallback (before Email)
        elif len(available_keys) > 0:
            # Find Email column index
            email_index = available_keys.index('Email') if 'Email' in available_keys else -1
            # If Email is in column B (index 1), then column A (index 0) is likely the name
            if email_index == 1:
                name_column_key = available_keys[0]
            else:
                # Last resort: use first column
                name_column_key = available_keys[0]
        
        if name_column_key is None:
            raise ValueError("Could not determine name column. Please ensure the spreadsheet has a name column in the first column.")

        # Student emails become trimmed, lowercased keys (the API looks students up that way);
        # rows such as "MAX POINTS" keep their exact key. See sheet_transform.py.
        entries, row_warnings = build_student_entries(records, categories, concepts, name_column_key)
        for warning in row_warnings:
            print(f"  ⚠️  {warning}")

        for key, entry in entries.items():
            redis_client.set(key, json.dumps(entry)) #sets key value for user:other data

        students = sum(1 for key in entries if "@" in key)
        print(f"✓ Successfully updated Redis database with {students} student records")
        
    except Exception as e:
        print(f"Error: {e}")
        print(f"Spreadsheet ID: {SPREADSHEET_ID}")
        print(f"Sheet name: {SHEETNAME}")
        raise

if __name__ == "__main__":
    update_redis()

