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
DB = int(os.getenv("BINS_DBINDEX"))
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")  # Fixed: Use SPREADSHEET_ID
SHEETNAME = os.getenv("SPREADSHEET_SHEETNAME")  # This is the sheet/tab name
WORKSHEET = int(os.getenv("BINS_WORKSHEET"))

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

def update_bins():
    print("Updating Bins from production spreadsheet...")
    print(f"Spreadsheet ID: {SPREADSHEET_ID}")
    print(f"Sheet name: {SHEETNAME}")
    
    try:
        # Try to read grade bins dynamically from the Constants sheet
        # This follows the original design where bins are stored in the spreadsheet
        grade_bins = []
        assignment_points = {}
        
        try:
            constants_sheet = client.open_by_key(SPREADSHEET_ID).worksheet('Constants')
            print("Successfully opened Constants sheet!")
            
            # Read grade bins from the configured range (A51:B61 as per config)
            # This should contain point thresholds and letter grades
            print("Reading grade bins from configured range...")
            
            # Read the bins data from the configured range
            start_row = int(os.getenv("BINS_START_ROW", "51"))
            end_row = int(os.getenv("BINS_END_ROW", "61"))
            points_col = int(os.getenv("BINS_POINTS_COL", "0"))  # Column A
            grades_col = int(os.getenv("BINS_GRADES_COL", "1"))  # Column B
            
            print(f"Reading bins from row {start_row} to {end_row}")
            
            for row in range(start_row, end_row + 1):
                try:
                    row_values = constants_sheet.row_values(row)
                    
                    # Skip empty rows
                    if len(row_values) <= max(points_col, grades_col) or not row_values[points_col] or not row_values[grades_col]:
                        continue
                    
                    # Try to parse the points as a number
                    try:
                        points = int(float(row_values[points_col]))
                    except (ValueError, TypeError):
                        print(f"Skipping row {row}: points value '{row_values[points_col]}' is not a number")
                        continue
                    
                    # Create a bin entry
                    grade_bin = {
                        "letter": row_values[grades_col],
                        "points": points
                    }
                    grade_bins.append(grade_bin)
                    print(f"Added bin: {grade_bin}")
                    
                except Exception as row_error:
                    print(f"Error processing row {row}: {row_error}")
                    continue
            
            if grade_bins:
                print(f"Successfully read {len(grade_bins)} grade bins from spreadsheet!")
                # Sort by points to ensure proper order
                grade_bins.sort(key=lambda x: x['points'])
            else:
                print("No grade bins found in configured range, using fallback...")
                # Fallback to standard bins if none found
                grade_bins = [
                    {"letter": "A+", "points": 97},
                    {"letter": "A", "points": 93},
                    {"letter": "A-", "points": 90},
                    {"letter": "B+", "points": 87},
                    {"letter": "B", "points": 83},
                    {"letter": "B-", "points": 80},
                    {"letter": "C+", "points": 77},
                    {"letter": "C", "points": 73},
                    {"letter": "C-", "points": 70},
                    {"letter": "D+", "points": 67},
                    {"letter": "D", "points": 63},
                    {"letter": "D-", "points": 60},
                    {"letter": "F", "points": 0}
                ]
                print("Using standard grade bins as fallback")
            
            # Also read assignment points for reference
            print("Reading assignment points...")
            for row in range(16, 50):  # Start from row 16 where assignments begin
                row_values = constants_sheet.row_values(row)
                if len(row_values) >= 2 and row_values[0] and row_values[1]:
                    try:
                        assignment_name = row_values[0]
                        points = int(float(row_values[1]))
                        assignment_points[assignment_name] = points
                    except (ValueError, TypeError):
                        continue
            
            if assignment_points:
                print(f"Found {len(assignment_points)} assignment point values")
            else:
                print("No assignment points found")
                
        except Exception as sheet_error:
            print(f"Error reading from Constants sheet: {sheet_error}")
            print("Using standard grade bins as fallback")
            # Fallback to standard bins
            grade_bins = [
                {"letter": "A", "points": 90},
                {"letter": "B", "points": 80},
                {"letter": "C", "points": 70},
                {"letter": "D", "points": 60},
                {"letter": "F", "points": 0}
            ]
        
        # Store the data in Redis
        bins_data = {
            "bins": grade_bins,
            "assignment_points": assignment_points,
            "total_course_points": sum(assignment_points.values()) if assignment_points else 0
        }
        
        bins_json = json.dumps(bins_data)
        redis_client.set("bins", bins_json)
        print(f"Successfully updated bins in Redis with {len(grade_bins)} grade bins!")
        print("Bins are now DYNAMIC and will update when you change the spreadsheet!")
        
    except Exception as e:
        print(f"Error updating bins: {e}")
        print(f"Spreadsheet ID: {SPREADSHEET_ID}")
        print(f"Sheet name: {SHEETNAME}")
        # Store default bins to prevent errors
        default_bins = {
            "bins": [
                {"letter": "A", "points": 90},
                {"letter": "B", "points": 80},
                {"letter": "C", "points": 70},
                {"letter": "D", "points": 60},
                {"letter": "F", "points": 0}
            ],
            "assignment_points": {},
            "total_course_points": 0
        }
        redis_client.set("bins", json.dumps(default_bins))
        print("Stored default bins to prevent errors")

if __name__ == "__main__":
    update_bins()
