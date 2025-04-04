import gspread
from google.oauth2.service_account import Credentials
import json
import os
import redis

from dotenv import load_dotenv
load_dotenv(dotenv_path='/dbcron/.env')


PORT = int(os.getenv("SERVER_PORT"))
SCOPES = json.loads(os.getenv("SPREADSHEET_SCOPES"))
HOST = os.getenv("SERVER_HOST")
DB = int(os.getenv("BINS_DBINDEX"))
SHEETNAME = os.getenv("SPREADSHEET_SHEETNAME")
WORKSHEET = int(os.getenv("BINS_WORKSHEET"))

REDIS_PW = os.getenv("REDIS_DB_SECRET")

credentials_json = os.getenv("SERVICE_ACCOUNT_CREDENTIALS")
credentials_dict = json.loads(credentials_json)
credentials = Credentials.from_service_account_info(credentials_dict, scopes=SCOPES)
client = gspread.authorize(credentials)

redis_client = redis.Redis(host=HOST, port=PORT, db=DB, password=REDIS_PW)

def update_bins():
    print("Updating Bins HERE 99999999999999")
    sheet = client.open(SHEETNAME).get_worksheet(WORKSHEET)
    start_row = int(os.getenv("BINS_START_ROW"))
    end_row = int(os.getenv("BINS_END_ROW"))
    points_col = int(os.getenv("BINS_POINTS_COL"))
    grades_col = int(os.getenv("BINS_GRADES_COL"))

    grade_bins = []

    for i in range(start_row, end_row + 1):
        row_values = sheet.row_values(i)
        grade_bin = {
            "letter": row_values[grades_col],
            "points": int(row_values[points_col])
        }
        grade_bins.append(grade_bin)

    bins_json = json.dumps({"bins": grade_bins})
    redis_client.set("bins", bins_json)

if __name__ == "__main__":
    update_bins()