# Python 3.12 (supported until 2028), pinned to an exact Debian slim tag.
FROM python:3.12.15-slim-trixie

# Install cron only, without recommended extras, and drop the apt lists
RUN apt-get update \
    && apt-get install -y --no-install-recommends cron \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /dbcron
# No __pycache__/ in the ./dbcron bind mount (the host checkout)
ENV PYTHONDONTWRITEBYTECODE=1

# Install required Python packages first so code changes reuse this layer
COPY requirements.txt /dbcron/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the scripts (see .dockerignore: no .env, keys or JSON dumps).
# At runtime compose mounts ./dbcron over /dbcron, which provides dbcron/.env.
COPY . /dbcron

RUN chmod +x manual_update_flush.py

# Prepare the cron job
COPY cronjob /etc/cron.d/cronjob
RUN chmod 0644 /etc/cron.d/cronjob \
    && crontab /etc/cron.d/cronjob \
    && touch /var/log/cron.log

# Start cron before the initial load, so the scheduled jobs run (and refill Redis within
# 5 minutes) even when the initial load fails or hangs, e.g. Redis or the Sheet is not
# reachable yet. The initial load prints to the container log, the cron jobs' output
# reaches it through tail, and the container runs as long as cron does. sh runs as PID 1,
# which ignores SIGTERM unless it traps it, so the trap lets `docker stop` end cron
# right away instead of waiting 10 seconds for SIGKILL.
CMD ["sh", "-c", "tail -n 0 -F /var/log/cron.log & cron -f & cron_pid=$!; trap 'kill $cron_pid 2>/dev/null; exit 0' TERM INT; python manual_update_flush.py || echo \"dbcron: initial load failed (exit $?); cron keeps running the scheduled jobs\" >&2; wait $cron_pid"]
