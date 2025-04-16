FROM python:3.8-slim

# Install cron + node
RUN apt-get update && apt-get install -y cron nodejs npm

WORKDIR /dbcron
COPY . /dbcron

# Install Python deps
RUN pip install --no-cache-dir -r requirements.txt

# Install Node dependencies from package.json
RUN npm install

RUN chmod +x manual_update_flush.py

# Set up cron
COPY cronjob /etc/cron.d/cronjob
RUN chmod 0644 /etc/cron.d/cronjob
RUN crontab /etc/cron.d/cronjob
RUN touch /var/log/cron.log

CMD ["sh", "-c", "python manual_update_flush.py && cron -f & tail -f /var/log/cron.log"]