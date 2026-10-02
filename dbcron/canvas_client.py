"""Minimal read-only Canvas REST client for the dbcron Canvas importer.

- Pagination follows the Link header's rel="next" URL, as Canvas requires.
- Requests only go to the configured origin (scheme + host). Redirects are refused, and
  https is required except for a local mock Canvas, so the bearer token cannot leak.
- Throttling (429, or 403 "Rate Limit Exceeded"), 5xx, timeouts and dropped connections are
  retried with backoff. Every failure surfaces as CanvasError.
- Response bodies are never logged, because they can contain student data.
"""
from __future__ import annotations

import http.client
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

_NEXT_LINK = re.compile(r'<([^>]+)>;\s*rel="next"')
_LOCAL_HOSTS = ("localhost", "127.0.0.1", "host.docker.internal")
_RETRY_STATUS = (429, 500, 502, 503, 504)


def _rate_limit_low(header_value, threshold=50):
    """True when X-Rate-Limit-Remaining is below the threshold. A missing or malformed header counts as not low."""
    if header_value is None:
        return False
    try:
        return float(header_value) < threshold
    except ValueError:
        return False  # malformed header: do not slow down, and do not fail the request over it


class CanvasError(Exception):
    """Any Canvas failure; messages never include tokens or response bodies."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Refuses all redirects so the bearer token is only ever sent to the configured origin."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        """Returns None, which makes urllib raise HTTPError(3xx) instead of following the redirect."""
        return None  # urllib then raises HTTPError(3xx), reported as CanvasError


class CanvasClient:
    """Read-only client for one Canvas instance, authenticated with a bearer token."""

    def __init__(self, base_url, token, timeout=30, per_page=100, max_retries=5, sleep=time.sleep):
        """Validates the token and base URL (https unless local) and prepares a no-redirect opener."""
        token = (token or "").strip()
        if not base_url or not token:
            raise CanvasError("CANVAS_BASE_URL and CANVAS_TOKEN are required")
        if any(c.isspace() or not c.isprintable() for c in token):
            raise CanvasError("CANVAS_TOKEN contains whitespace or control characters")
        self.base_url = base_url.rstrip("/")
        parsed = urllib.parse.urlparse(self.base_url)
        if parsed.scheme != "https" and parsed.hostname not in _LOCAL_HOSTS:
            raise CanvasError("CANVAS_BASE_URL must use https (http is allowed only for a local mock Canvas)")
        self.origin = (parsed.scheme, parsed.netloc)
        self.token = token
        self.timeout = timeout
        self.per_page = per_page
        self.max_retries = max_retries
        self._sleep = sleep
        self._opener = urllib.request.build_opener(_NoRedirect)

    def _url(self, path, params=None):
        """Builds an /api/v1 URL with query params, adding per_page when absent."""
        params = list(params or [])
        if not any(k == "per_page" for k, _ in params):
            params.append(("per_page", str(self.per_page)))
        return f"{self.base_url}/api/v1{path}?{urllib.parse.urlencode(params)}"

    def _backoff(self, attempt, retry_after=None):
        """Sleeps for Retry-After seconds if given, else 2**attempt, capped at 60 seconds."""
        delay = int(retry_after) if retry_after and str(retry_after).isdigit() else 2 ** attempt
        self._sleep(min(delay, 60))

    def _request(self, url):
        """GETs one URL on the pinned origin with retries; returns (parsed JSON body, Link header)."""
        parsed = urllib.parse.urlparse(url)
        if (parsed.scheme, parsed.netloc) != self.origin:
            raise CanvasError("Refusing to follow a link to a different origin")
        where = parsed.path
        for attempt in range(self.max_retries + 1):
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self.token}", "Accept": "application/json"})
            try:
                with self._opener.open(req, timeout=self.timeout) as resp:
                    raw = resp.read()
                    link = resp.headers.get("Link", "")
                    remaining = resp.headers.get("X-Rate-Limit-Remaining")
                try:
                    body = json.loads(raw.decode("utf-8"))
                except ValueError:
                    raise CanvasError(f"Canvas returned a non-JSON response for {where}") from None
                if _rate_limit_low(remaining):
                    self._sleep(1)
                return body, link
            except urllib.error.HTTPError as err:
                retryable = err.code in _RETRY_STATUS or (err.code == 403 and b"Rate Limit Exceeded" in (err.read() or b""))
                if retryable and attempt < self.max_retries:
                    self._backoff(attempt, err.headers.get("Retry-After") if err.headers else None)
                    continue
                raise CanvasError(f"Canvas returned HTTP {err.code} for {where}") from None
            except (urllib.error.URLError, OSError, http.client.HTTPException) as err:
                # timeouts, resets, RemoteDisconnected, IncompleteRead
                if attempt < self.max_retries:
                    self._backoff(attempt)
                    continue
                raise CanvasError(f"Could not reach Canvas ({type(err).__name__}) for {where}") from None
        raise CanvasError(f"Canvas request failed after retries for {where}")

    def get(self, path, params=None):
        """Returns the JSON body of a single GET request."""
        body, _ = self._request(self._url(path, params))
        return body

    def get_all(self, path, params=None):
        """Returns every item of a paginated list endpoint, following rel="next" links."""
        url, items = self._url(path, params), []
        while url:
            body, link = self._request(url)
            if not isinstance(body, list):
                raise CanvasError(f"Expected a list from {path}")
            items.extend(body)
            match = _NEXT_LINK.search(link or "")
            url = match.group(1) if match else None
        return items


def fetch_grading_standard(client, course):
    """Returns (standard_or_None, source). source is course, account, canvas_default, none or unavailable."""
    gsid = course.get("grading_standard_id")
    if gsid is None:
        return None, "none"
    if gsid == 0:
        return None, "canvas_default"
    candidates = [(f"/courses/{course['id']}/grading_standards/{gsid}", "course")]
    if course.get("account_id"):
        candidates.append((f"/accounts/{course['account_id']}/grading_standards/{gsid}", "account"))
    for path, source in candidates:
        try:
            return client.get(path), source
        except CanvasError:
            continue  # the scheme is not owned at this level; try the next owner (course, then account)
    return None, "unavailable"


def fetch_course(client, course_id):
    """Fetches everything the transform needs for one course (about eight read-only GETs plus paging)."""
    c = f"/courses/{course_id}"
    course = client.get(c)
    standard, source = fetch_grading_standard(client, course)
    return {
        "course": course,
        "assignment_groups": client.get_all(f"{c}/assignment_groups"),
        "assignments": client.get_all(f"{c}/assignments"),
        "students": client.get_all(f"{c}/users", [("enrollment_type[]", "student"), ("enrollment_state[]", "active")]),
        "staff": client.get_all(f"{c}/users", [("enrollment_type[]", "teacher"), ("enrollment_type[]", "ta"), ("enrollment_state[]", "active")]),
        "staff_enrollments": client.get_all(f"{c}/enrollments", [("type[]", "TaEnrollment"), ("type[]", "TeacherEnrollment"), ("state[]", "active")]),
        "submissions": client.get_all(f"{c}/students/submissions", [("student_ids[]", "all"), ("grouped", "true")]),
        "grading_standard": standard,
        "grading_standard_source": source,
    }
