import redis
import json
import os
import socket
from dotenv import load_dotenv

# --- Load environment ---
load_dotenv()

# --- Smart connect ---
def get_redis_url():
    try:
        socket.gethostbyname('redis')
        print("[info] Running inside Docker. Using redis:6379 with password")
        return "redis://:NciZ!4DfXxwAUNA@redis:6379"
    except socket.gaierror:
        print("[info] Running on Mac. Using localhost:6379 without password")
        return "redis://localhost:6379"

# 🛠 USE the smart function here!
redis_url = get_redis_url()

# Connect to Redis
r = redis.Redis.from_url(redis_url)

# --- Helper to normalize names ---
def normalize_name(name):
    return name.strip().lower()

def main():
    keys = [key.decode('utf-8') for key in r.keys('*@*')]

    if not keys:
        print("[!] No student keys found.")
        return

    print(f"Found {len(keys)} students:\n")

    for key in sorted(keys):
        raw = r.get(key)
        if not raw:
            print(f"[✗] {key} — no data")
            continue
        data = json.loads(raw)

        assignments = data.get("Assignments", {})
        num_categories = len(assignments)
        num_concepts = sum(len(assignments[cat]) for cat in assignments)

        print(f"[✓] {key} → {num_categories} categories, {num_concepts} concepts.")

if __name__ == "__main__":
    main()
