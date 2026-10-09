# Pinned to a dated build (python3.11 alone moves every week); bump it deliberately.
FROM tiangolo/uwsgi-nginx:python3.11-2026-09-21
# The image's internal nginx listens on LISTEN_PORT; the GradeView reverse proxy
# expects dtgui-progress-report:8080 (compose can override it, but keep them equal).
ENV LISTEN_PORT=8080
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade -r requirements.txt
COPY . /app
EXPOSE 8080
