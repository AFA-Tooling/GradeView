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
            print(f"Expected format: Points in column {chr(65 + points_col)} (left), Letter grades in column {chr(65 + grades_col)} (right)")
            print(f"Expected order: Ascending (F at top, A+ at bottom)")
            
            # VALIDATION: Check bins page structure
            print("\n" + "="*60)
            print("BINS PAGE STRUCTURE VALIDATION")
            print("="*60)
            
            # Read a sample of rows to validate structure
            sample_rows = []
            for row in range(start_row, min(start_row + 5, end_row + 1)):
                try:
                    row_values = constants_sheet.row_values(row)
                    if len(row_values) > max(points_col, grades_col):
                        sample_rows.append((row, row_values))
                except:
                    pass
            
            if sample_rows:
                print(f"\nSample of bins data (first {len(sample_rows)} rows):")
                for row_num, row_values in sample_rows:
                    points_val = row_values[points_col] if len(row_values) > points_col else "(empty)"
                    grade_val = row_values[grades_col] if len(row_values) > grades_col else "(empty)"
                    print(f"  Row {row_num}: Points={points_val}, Grade={grade_val}")
            
            bins_structure_warnings = []
            
            # Check if points column has numeric values
            points_are_numeric = True
            for row in range(start_row, end_row + 1):
                try:
                    row_values = constants_sheet.row_values(row)
                    if len(row_values) > points_col and row_values[points_col]:
                        try:
                            float(row_values[points_col])
                        except (ValueError, TypeError):
                            points_are_numeric = False
                            bins_structure_warnings.append(f"Row {row}: Points value '{row_values[points_col]}' is not numeric")
                            break
                except:
                    pass
            
            if points_are_numeric:
                print("✓ Points column contains numeric values")
            else:
                print("⚠️  Some points values may not be numeric")
            
            # Check if grades column has letter grades
            grade_format_valid = True
            expected_grades = ['F', 'D', 'D-', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+']
            for row in range(start_row, end_row + 1):
                try:
                    row_values = constants_sheet.row_values(row)
                    if len(row_values) > grades_col and row_values[grades_col]:
                        grade = str(row_values[grades_col]).strip()
                        # Check if it looks like a letter grade
                        if not any(g in grade for g in expected_grades):
                            grade_format_valid = False
                            bins_structure_warnings.append(f"Row {row}: Grade '{grade}' may not be a valid letter grade")
                except:
                    pass
            
            if grade_format_valid:
                print("✓ Grades column contains letter grades")
            else:
                print("⚠️  Some grades may not be in expected format")
            
            print("="*60 + "\n")
            
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
                
                # Validate ascending order
                is_ascending = all(
                    grade_bins[i]['points'] <= grade_bins[i + 1]['points'] 
                    for i in range(len(grade_bins) - 1)
                )
                if is_ascending:
                    print("✓ Bins are in ascending order (F to A+)")
                else:
                    print("⚠️  WARNING: Bins may not be in ascending order - sorting applied")
                
                # Log all bins with their calculated ranges
                print("\n" + "="*60)
                print("GRADE BINS SUMMARY (as they will appear in the UI):")
                print("="*60)
                for i in range(len(grade_bins) - 1, -1, -1):  # Reverse order (highest to lowest)
                    grade = grade_bins[i]['letter']
                    points = grade_bins[i]['points']
                    lower = grade_bins[i - 1]['points'] if i > 0 else 0
                    range_str = f"{lower}-{points}"
                    print(f"  {grade:4s}: {range_str:12s} (threshold: {points} points)")
                print("="*60 + "\n")
                
                # Validate specific C grade ranges
                print("VALIDATION CHECKS:")
                c_plus_bin = next((b for b in grade_bins if b['letter'] == 'C+'), None)
                c_bin = next((b for b in grade_bins if b['letter'] == 'C'), None)
                c_minus_bin = next((b for b in grade_bins if b['letter'] == 'C-'), None)
                d_bin = next((b for b in grade_bins if b['letter'] == 'D'), None)
                
                if c_plus_bin and c_bin and c_minus_bin:
                    # Calculate what the ranges will be (same logic as frontend)
                    # Frontend iterates backwards: for (let i = res.data.length - 1; i >= 0; i--)
                    # lower = (i !== 0) ? +res.data[i - 1]['points'] : 0
                    # So for each grade at index i, lower bound is data[i-1]['points']
                    # Since data is sorted ascending, we need to find indices in sorted order
                    c_plus_index = grade_bins.index(c_plus_bin)
                    c_index = grade_bins.index(c_bin)
                    c_minus_index = grade_bins.index(c_minus_bin)
                    
                    # When iterating backwards (as frontend does), the lower bound for grade at index i
                    # is the points value of the grade at index i-1 (the previous grade in sorted order)
                    c_plus_lower = grade_bins[c_index]['points'] if c_index >= 0 else 0
                    c_lower = grade_bins[c_minus_index]['points'] if c_minus_index >= 0 else 0
                    c_minus_lower = grade_bins[c_minus_index - 1]['points'] if c_minus_index > 0 else 0
                    
                    c_plus_range = f"{c_plus_lower}-{c_plus_bin['points']}"
                    c_range = f"{c_lower}-{c_bin['points']}"
                    c_minus_range = f"{c_minus_lower}-{c_minus_bin['points']}"
                    
                    print(f"  C+ range: {c_plus_range} (expected: 310-320)")
                    print(f"  C  range: {c_range} (expected: 290-310)")
                    print(f"  C- range: {c_minus_range} (expected: 280-290)")
                    if d_bin:
                        d_lower = grade_bins[grade_bins.index(d_bin) - 1]['points'] if grade_bins.index(d_bin) > 0 else 0
                        d_range = f"{d_lower}-{d_bin['points']}"
                        print(f"  D  range: {d_range} (expected: 240-280)")
                    
                    # Check if values match expected
                    warnings = []
                    if c_plus_range != "310-320":
                        warnings.append(f"⚠️  C+ range is {c_plus_range}, expected 310-320")
                    if c_range != "290-310":
                        warnings.append(f"⚠️  C range is {c_range}, expected 290-310")
                    if c_minus_range != "280-290":
                        warnings.append(f"⚠️  C- range is {c_minus_range}, expected 280-290")
                    if d_bin:
                        d_lower = grade_bins[grade_bins.index(d_bin) - 1]['points'] if grade_bins.index(d_bin) > 0 else 0
                        d_range = f"{d_lower}-{d_bin['points']}"
                        if d_range != "240-280":
                            warnings.append(f"⚠️  D range is {d_range}, expected 240-280")
                    
                    if warnings:
                        print("\n  VALIDATION WARNINGS:")
                        for warning in warnings:
                            print(f"    {warning}")
                        print("\n  To fix, update the spreadsheet Constants sheet:")
                        if c_plus_bin['points'] != 320:
                            print(f"    - C+ threshold should be 320 (currently {c_plus_bin['points']})")
                        if c_bin['points'] != 310:
                            print(f"    - C threshold should be 310 (currently {c_bin['points']})")
                        if c_minus_bin['points'] != 290:
                            print(f"    - C- threshold should be 290 (currently {c_minus_bin['points']})")
                        if d_bin and d_bin['points'] != 280:
                            print(f"    - D threshold should be 280 (currently {d_bin['points']}) to make C- range 280-290")
                        if d_bin:
                            # Check if F threshold is correct for D range 240-280
                            f_bin = next((b for b in grade_bins if b['letter'] == 'F'), None)
                            if f_bin and f_bin['points'] != 240:
                                print(f"    - F threshold should be 240 (currently {f_bin['points']}) to make D range 240-280")
                    else:
                        print("  ✅ All C grade ranges are correct!")
                else:
                    missing = []
                    if not c_plus_bin: missing.append("C+")
                    if not c_bin: missing.append("C")
                    if not c_minus_bin: missing.append("C-")
                    print(f"  ⚠️  Missing grade bins: {', '.join(missing)}")
                print()
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
            # NOTE: This reads from rows 16-50 in the Constants sheet
            # Format: Column A = Assignment name, Column B = Points
            # This should contain the high-level grading breakdown (Quest, Midterm, Projects, Labs, etc.)
            assignment_start_row = int(os.getenv("ASSIGNMENT_POINTS_START_ROW", "16"))
            assignment_end_row = int(os.getenv("ASSIGNMENT_POINTS_END_ROW", "50"))
            print(f"\nReading assignment points from rows {assignment_start_row}-{assignment_end_row}...")
            print(f"Expected format: Column A = Assignment name, Column B = Points")
            print(f"This should contain the GRADING BREAKDOWN (Quest, Midterm, Projects, Labs, etc.)")
            
            for row in range(assignment_start_row, assignment_end_row + 1):
                row_values = constants_sheet.row_values(row)
                if len(row_values) >= 2 and row_values[0] and row_values[1]:
                    try:
                        assignment_name = row_values[0].strip()
                        points = int(float(row_values[1]))
                        assignment_points[assignment_name] = points
                    except (ValueError, TypeError):
                        continue
            
            if assignment_points:
                print(f"\n✓ Found {len(assignment_points)} assignment point values")
                print("\n" + "="*60)
                print("GRADING BREAKDOWN (Assignment Points)")
                print("="*60)
                print("This is what will be displayed in the 'Grading Breakdown' table on the website.")
                print("If this doesn't match what you expect, update the Constants sheet rows 16-50.")
                print("Format: Column A = Assignment name, Column B = Points")
                print("-"*60)
                total_points = 0
                for assignment, points in sorted(assignment_points.items()):
                    print(f"  {assignment:40s}: {points:5d} points")
                    total_points += points
                print("-"*60)
                print(f"{'Total Course Points':40s}: {total_points:5d} points")
                print("="*60 + "\n")
                
                # Validate if this looks like the expected grading breakdown
                expected_assignments = ['Quest', 'Midterm', 'Postterm', 'Project', 'Labs', 'Attendance', 'Participation']
                found_expected = any(
                    any(exp.lower() in assignment.lower() for exp in expected_assignments)
                    for assignment in assignment_points.keys()
                )
                if not found_expected and len(assignment_points) > 10:
                    print("⚠️  WARNING: The grading breakdown appears to contain individual assignments")
                    print("   (e.g., Lab0, Lab1, etc.) rather than high-level categories.")
                    print("   Consider grouping these into categories like:")
                    print("   - Quest: 25 points")
                    print("   - Midterm: 50 points")
                    print("   - Postterm: 75 points")
                    print("   - Labs: 80 points (sum of all labs)")
                    print("   - Projects: [individual project points]")
                    print("   - Attendance / Participation: 15 points")
                    print()
            else:
                print("⚠️  No assignment points found")
                print("   To add grading breakdown, put assignment names in Column A and")
                print(f"   points in Column B of the Constants sheet, starting at row {assignment_start_row}.")
                
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
        
        # Final validation summary
        print("\n" + "="*60)
        print("VALIDATION SUMMARY")
        print("="*60)
        print(f"✓ Bins page structure validated")
        print(f"✓ {len(grade_bins)} grade bins loaded and sorted")
        if assignment_points:
            print(f"✓ {len(assignment_points)} assignment points loaded")
            print(f"✓ Total course points: {sum(assignment_points.values())}")
        print("="*60 + "\n")
        
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
