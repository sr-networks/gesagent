import argparse
import csv
import json
import os
from pathlib import Path
from typing import Iterable, Optional, Dict, Any

from .scraper import DejureScraper, CaseRecord


def _write_jsonl(path: Path, records: Iterable[CaseRecord]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def _write_csv(path: Path, records: Iterable[CaseRecord]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "url",
        "court",
        "date",
        "file_number",
        "title",
        "leitsatz",
        "tenor",
        "full_text",
    ]
    # If file exists with an older header, rewrite the file with new schema
    existing_rows: list[Dict[str, Any]] = []
    if path.exists():
        try:
            with path.open("r", encoding="utf-8", newline="") as rf:
                reader = csv.DictReader(rf)
                old_fields = reader.fieldnames or []
                # If header differs from expected, migrate
                if set(old_fields) != set(fieldnames):
                    for row in reader:
                        # map to new fields; keep missing as empty
                        existing_rows.append({k: row.get(k, "") for k in fieldnames})
                    # Rewrite after merging with new batch below
                else:
                    # No migration needed; we'll append directly below
                    with path.open("a", encoding="utf-8", newline="") as f:
                        writer = csv.DictWriter(f, fieldnames=fieldnames)
                        for rec in records:
                            row: Dict[str, Any] = {k: rec.get(k, "") for k in fieldnames}
                            writer.writerow(row)
                    return
        except Exception:
            # If anything goes wrong reading, fall back to rewriting fresh with new header
            existing_rows = []

    # If we reach here we either have no file or we need migration; write fresh
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in existing_rows:
            writer.writerow(row)
        for rec in records:
            row: Dict[str, Any] = {k: rec.get(k, "") for k in fieldnames}
            writer.writerow(row)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Scrape case metadata from dejure.org respectfully")
    p.add_argument("--out", type=str, default="data/dejure/cases",
                   help="Output directory for JSONL files (default: data/dejure/cases)")
    p.add_argument("--csv", type=str, default="",
                   help="Optional CSV file path to also write a flattened subset")
    p.add_argument("--max-pages", type=int, default=50,
                   help="Max pages to visit (0 = unlimited). Default: 50")
    p.add_argument("--delay", type=float, default=2.0,
                   help="Seconds delay between requests. Default: 2.0")
    p.add_argument("--only-court", type=str, default="",
                   help="Optional court key/name filter (substring match against link text)")
    p.add_argument("--user-agent", type=str, default="gesagent-dejurescrape/1.0",
                   help="Custom User-Agent string")
    return p


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = build_parser().parse_args(argv)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = out_dir / "cases.jsonl"
    csv_path = Path(args.csv) if args.csv else None

    scraper = DejureScraper(
        base_url="https://dejure.org",
        start_path="/gerichte",
        delay_seconds=args.delay,
        user_agent=args.user_agent,
        court_filter=args.only_court or None,
        max_pages=args.max_pages if args.max_pages and args.max_pages > 0 else None,
    )

    written = 0
    batch: list[CaseRecord] = []
    for rec in scraper.run():
        batch.append(rec)
        if len(batch) >= 10:
            _write_jsonl(jsonl_path, batch)
            if csv_path:
                _write_csv(csv_path, batch)
            written += len(batch)
            batch.clear()

    if batch:
        _write_jsonl(jsonl_path, batch)
        if csv_path:
            _write_csv(csv_path, batch)
        written += len(batch)

    print(f"Wrote {written} records to {jsonl_path}" + (f" and {csv_path}" if csv_path else ""))
    return 0


