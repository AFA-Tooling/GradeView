from update_db import update_redis
from flush_db import flush_redis_db
from update_bins import update_bins
from update_cm import update_cm
import redis
import os
from dotenv import load_dotenv
load_dotenv()
if __name__ == "__main__":
    flush_redis_db()
    update_redis()
    update_bins()
