# Python 3.12 (supported until 2028), pinned to an exact Debian slim tag.
FROM python:3.12.15-slim-trixie

# Install cron only, without recommended extras, and drop the apt lists
RUN apt-get update \
    && apt-get install -y --no-install-recommends cron \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /dbcron

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

# Start cron in the foreground and tail the log file
CMD ["sh", "-c", "python manual_update_flush.py && cron -f & tail -f /var/log/cron.log"]
