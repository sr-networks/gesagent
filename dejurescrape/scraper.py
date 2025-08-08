from __future__ import annotations

import time
import urllib.robotparser
from dataclasses import dataclass, asdict
from typing import Iterator, Optional, Dict, Any, TypedDict

import requests
from bs4 import BeautifulSoup
from dateutil import parser as dateparser
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type


class CaseRecord(TypedDict, total=False):
    url: str
    court: str
    date: str
    file_number: str
    title: str
    leitsatz: str
    tenor: str
    references: dict[str, list[str]]
    full_text: str


class FetchError(Exception):
    pass


def _is_meta_disallowed(soup: BeautifulSoup) -> bool:
    tag = soup.find("meta", attrs={"name": "robots"})
    if not tag:
        return False
    content = (tag.get("content") or "").lower()
    return "noindex" in content or "nofollow" in content


def _clean_text(s: str | None) -> str:
    if not s:
        return ""
    return " ".join(s.split())


@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type(FetchError),
)
def _get(session: requests.Session, url: str) -> requests.Response:
    resp = session.get(url, timeout=20)
    if resp.status_code >= 500:
        raise FetchError(f"Server error {resp.status_code} for {url}")
    return resp


def _extract_main_text(soup: BeautifulSoup) -> str:
    # Heuristics to get prominent content text on dejure pages
    candidates = []
    # Prefer article/main content blocks if present
    for sel in [
        "main",
        "article",
        "#content",
        ".content",
        "#main",
        ".hauptinhalt",
    ]:
        for el in soup.select(sel):
            txt = _clean_text(el.get_text("\n"))
            if len(txt) > 500:
                candidates.append(txt)
    if candidates:
        return max(candidates, key=len)
    # Fallback: longest text block in page
    return _clean_text(soup.get_text("\n"))


def _fetch_full_text_from_targets(session: requests.Session, base_url: str, soup: BeautifulSoup, delay_seconds: float) -> str:
    # Look for the "Volltextveröffentlichungen" section and follow reputable links
    preferred_hosts = [
        "bundesgerichtshof.de",
        "bverfg.de",
        "rechtsprechung-im-internet.de",
        "openjur.de",
        "rechtsinformationen.bund.de",
        "eur-lex.europa.eu",
    ]
    links: list[str] = []
    for a in soup.find_all("a"):
        href = a.get("href") or ""
        if href.startswith("/"):
            href = f"{base_url}{href}"
        if href.startswith("http") and any(host in href for host in preferred_hosts):
            links.append(href)
    # Try preferred links first, then any external links if needed
    tried: set[str] = set()
    ordered = links + [
        href if href.startswith("http") else f"{base_url}{href}"
        for href in {a.get("href") or "" for a in soup.find_all("a")}
        if href and href.startswith("http") and href not in links
    ]
    for url in ordered:
        if url in tried:
            continue
        tried.add(url)
        # Be polite
        if delay_seconds:
            time.sleep(delay_seconds)
        try:
            r = _get(session, url)
            if (r.headers.get("content-type") or "").lower().startswith("text/html"):
                sub = BeautifulSoup(r.text, "lxml")
                text = _extract_main_text(sub)
                # Heuristic threshold: consider it a judgment if long enough
                if len(text) > 1500 and any(k in text for k in ("Tatbestand", "Entscheidungsgründe", "Tenor", "Gründe")):
                    return text
        except Exception:
            continue
    return ""


class DejureScraper:
    def __init__(
        self,
        base_url: str,
        start_path: str,
        delay_seconds: float = 2.0,
        user_agent: str = "gesagent-dejurescrape/1.0",
        court_filter: Optional[str] = None,
        max_pages: Optional[int] = 50,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.start_path = start_path
        self.delay_seconds = max(0.0, delay_seconds)
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent})
        self.court_filter = (court_filter or "").lower() or None
        self.max_pages = max_pages

        # robots
        self.ignore_robots = False
        self.robots = urllib.robotparser.RobotFileParser()
        robots_url = f"{self.base_url}/robots.txt"
        try:
            # Fetch robots.txt directly to inspect content type
            r = requests.get(robots_url, timeout=10, headers={"User-Agent": user_agent})
            ct = (r.headers.get("content-type") or "").lower()
            body = r.text
            if "text/plain" in ct and "user-agent" in body.lower():
                self.robots.parse(body.splitlines())
            else:
                # Non-standard robots -> default to allow
                self.ignore_robots = True
        except Exception:
            self.ignore_robots = True

    def _allowed(self, path: str) -> bool:
        if self.ignore_robots:
            return True
        try:
            return self.robots.can_fetch(self.session.headers.get("User-Agent", "*"), f"{self.base_url}{path}")
        except Exception:
            return True

    def _sleep(self) -> None:
        if self.delay_seconds:
            time.sleep(self.delay_seconds)

    def _abs(self, href: str) -> str:
        if href.startswith("http://") or href.startswith("https://"):
            return href
        if not href.startswith("/"):
            href = "/" + href
        return f"{self.base_url}{href}"

    def run(self) -> Iterator[CaseRecord]:
        pages_visited = 0

        # 1) Fetch courts index
        start_url = f"{self.base_url}{self.start_path}"
        if not self._allowed(self.start_path):
            return
        self._sleep()
        resp = _get(self.session, start_url)
        soup = BeautifulSoup(resp.text, "lxml")

        # From the index page itself, collect any prominently listed case links
        case_paths: list[str] = []
        for a in soup.select("a"):
            href = a.get("href") or ""
            if not href.startswith("/"):
                continue
            txt = _clean_text(a.get_text())
            # Example text: "BGH, 12.06.2025 - III ZR 109/24"
            if href.startswith("/dienste/vernetzung/rechtsprechung") and (" - " in txt or any(k in txt for k in ("ZR", "ZB", "StR", "BvR", "C-", "AZ", "Az."))):
                case_paths.append(href)

        # Deduplicate case paths gathered on index
        seen = set()
        case_paths = [x for x in case_paths if not (x in seen or seen.add(x))]

        # 2) Visit case pages gathered from index and extract fields
        for path in case_paths:
            if self.max_pages and pages_visited >= self.max_pages:
                break
            if not self._allowed(path):
                continue
            self._sleep()
            r = _get(self.session, self._abs(path))
            pages_visited += 1
            soup = BeautifulSoup(r.text, "lxml")
            if _is_meta_disallowed(soup):
                continue

            # Some case entries have a canonical short URL like /2025,17804 in the citation block
            short = None
            for a in soup.find_all("a"):
                href = a.get("href") or ""
                if href.startswith("/") and any(ch.isdigit() for ch in href[:6]) and "," in href:
                    short = href
                    break
            if short and self._allowed(short):
                # fetch short page for consistent parsing
                self._sleep()
                r2 = _get(self.session, self._abs(short))
                pages_visited += 1
                soup = BeautifulSoup(r2.text, "lxml")
                if _is_meta_disallowed(soup):
                    continue

            rec: CaseRecord = {"url": self._abs(short or path)}

            # Title
            title = soup.find("h1") or soup.find("title")
            rec["title"] = _clean_text(title.get_text()) if title else ""

            # Court, Date, File number (heuristics)
            # Often presented near the top, sometimes in a breadcrumb or header block
            header_text = " ".join(el.get_text(separator=" ") for el in soup.select("h1, h2, .kopf, .header, .entscheidung, .az, .aktenzeichen")[:5])
            header_text = _clean_text(header_text)
            if not header_text and title:
                header_text = _clean_text(title.get_text())
            # Try to parse date
            date_str = ""
            for chunk in header_text.split(" "):
                try:
                    dt = dateparser.parse(chunk, dayfirst=True, fuzzy=True)
                    if 1900 <= dt.year <= 2100:
                        date_str = dt.date().isoformat()
                        break
                except Exception:
                    pass
            rec["date"] = date_str

            # File number heuristic: look for common patterns like "- X ZR 123/20 -" or "Az.: 2 StR 45/22"
            az = ""
            text_candidates = header_text + " " + " ".join(p.get_text(" ") for p in soup.select(".az, .aktenzeichen"))
            text_candidates = _clean_text(text_candidates)
            for token in text_candidates.split(" "):
                if any(sep in token for sep in ("/", "-")) and any(k in token for k in ("ZR", "ZB", "StR", "BvR", "AZ", "Az.", "C-")):
                    az = token.strip(";,.()[]")
                    break
            rec["file_number"] = az

            # Court heuristic: try from breadcrumbs or header
            court = ""
            crumbs = soup.select(".breadcrumb a, nav.breadcrumb a")
            if crumbs:
                court = _clean_text(crumbs[-1].get_text())
            if not court:
                # fallback: from header chunks
                for kw in ("BVerfG", "BGH", "BAG", "BSG", "BFH", "EuGH", "EGMR", "VG", "OVG", "VGH", "LG", "OLG", "AG"):
                    if kw in header_text:
                        court = kw
                        break
            rec["court"] = court

            # Leitsatz and Tenor blocks heuristically by headings
            def extract_section(heading_words: tuple[str, ...]) -> str:
                for h in soup.find_all(["h2", "h3", "strong"]):
                    ht = _clean_text(h.get_text()).lower()
                    if any(w.lower() in ht for w in heading_words):
                        # collect following siblings until next heading
                        parts: list[str] = []
                        for sib in h.next_siblings:
                            if getattr(sib, "name", None) in ("h1", "h2", "h3", "strong"):
                                break
                            txt = _clean_text(getattr(sib, "get_text", lambda *_: str(sib))(" "))
                            if txt:
                                parts.append(txt)
                        return "\n\n".join(parts).strip()
                return ""

            rec["leitsatz"] = extract_section(("Leitsatz",))
            rec["tenor"] = extract_section(("Tenor",))

            # References: collect links to laws and other cases
            refs: dict[str, list[str]] = {"laws": [], "cases": []}
            for a in soup.select("a"):
                href = a.get("href") or ""
                if href.startswith("/gesetze"):
                    refs["laws"].append(self._abs(href))
                elif any(seg in href for seg in ("/urteil", "/entscheidung", "/rechtsprechung")):
                    refs["cases"].append(self._abs(href))
            # Deduplicate
            refs = {k: sorted(set(v)) for k, v in refs.items()}
            if any(refs.values()):
                rec["references"] = refs

            # Full text: follow external official links if available
            full_text = _fetch_full_text_from_targets(self.session, self.base_url, soup, self.delay_seconds)
            if full_text:
                rec["full_text"] = full_text

            yield rec

        # 3) Optionally: follow court pages to discover additional cases (best-effort)
        court_links: list[str] = []
        for a in soup.select("a"):
            text = _clean_text(a.get_text())
            href = a.get("href") or ""
            if not href or not href.startswith("/"):
                continue
            if self.court_filter and self.court_filter not in text.lower():
                continue
            if any(seg in href for seg in ("/gesetze", "/corona", "/benutzer", "/stellenmarkt", "/dienste/vernetzung/rechtsprechung")):
                continue
            court_links.append(href)

        seen = set()
        court_links = [x for x in court_links if not (x in seen or seen.add(x))]

        for path in court_links:
            if self.max_pages and pages_visited >= self.max_pages:
                break
            if not self._allowed(path):
                continue
            self._sleep()
            r = _get(self.session, self._abs(path))
            pages_visited += 1
            psoup = BeautifulSoup(r.text, "lxml")
            local_cases: list[str] = []
            for a in psoup.find_all("a"):
                href = a.get("href") or ""
                if not href.startswith("/"):
                    continue
                txt = _clean_text(a.get_text())
                if href.startswith("/dienste/vernetzung/rechtsprechung") and (" - " in txt or any(k in txt for k in ("ZR", "ZB", "StR", "BvR", "C-", "AZ", "Az."))):
                    local_cases.append(href)

            seen = set()
            local_cases = [x for x in local_cases if not (x in seen or seen.add(x))]
            for cpath in local_cases:
                if self.max_pages and pages_visited >= self.max_pages:
                    break
                if not self._allowed(cpath):
                    continue
                self._sleep()
                rr = _get(self.session, self._abs(cpath))
                pages_visited += 1
                csoup = BeautifulSoup(rr.text, "lxml")
                if _is_meta_disallowed(csoup):
                    continue
                short = None
                for a in csoup.find_all("a"):
                    href = a.get("href") or ""
                    if href.startswith("/") and any(ch.isdigit() for ch in href[:6]) and "," in href:
                        short = href
                        break
                if short and self._allowed(short):
                    self._sleep()
                    rr2 = _get(self.session, self._abs(short))
                    pages_visited += 1
                    csoup = BeautifulSoup(rr2.text, "lxml")
                    if _is_meta_disallowed(csoup):
                        continue

                title = csoup.find("h1") or csoup.find("title")
                header_text = _clean_text(title.get_text()) if title else ""

                date_str = ""
                for chunk in header_text.split(" "):
                    try:
                        dt = dateparser.parse(chunk, dayfirst=True, fuzzy=True)
                        if 1900 <= dt.year <= 2100:
                            date_str = dt.date().isoformat()
                            break
                    except Exception:
                        pass

                az = ""
                for token in header_text.split(" "):
                    if any(sep in token for sep in ("/", "-")) and any(k in token for k in ("ZR", "ZB", "StR", "BvR", "AZ", "Az.", "C-")):
                        az = token.strip(";,.()[]")
                        break

                court = ""
                for kw in ("BVerfG", "BGH", "BAG", "BSG", "BFH", "EuGH", "EGMR", "VG", "OVG", "VGH", "LG", "OLG", "AG"):
                    if kw in header_text:
                        court = kw
                        break

                refs: dict[str, list[str]] = {"laws": [], "cases": []}
                for a in csoup.select("a"):
                    href = a.get("href") or ""
                    if href.startswith("/gesetze"):
                        refs["laws"].append(self._abs(href))
                    elif any(seg in href for seg in ("/urteil", "/entscheidung", "/rechtsprechung")):
                        refs["cases"].append(self._abs(href))
                refs = {k: sorted(set(v)) for k, v in refs.items()}

                out: CaseRecord = {
                    "url": self._abs(short or cpath),
                    "title": header_text,
                    "date": date_str,
                    "file_number": az,
                    "court": court,
                }
                if any(refs.values()):
                    out["references"] = refs
                # Full text
                full_text = _fetch_full_text_from_targets(self.session, self.base_url, csoup, self.delay_seconds)
                if full_text:
                    out["full_text"] = full_text
                yield out


