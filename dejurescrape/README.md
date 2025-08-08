dejure.org case scraper

A respectful Python CLI tool to collect case metadata from dejure.org. It:
- Checks and obeys robots.txt
- Applies polite rate limiting and retries
- Crawls court listings starting from `https://dejure.org/gerichte`
- Extracts case fields (court, date, file number, title, leitsatz, tenor, references)
- Saves JSONL and optional CSV into `data/dejure/cases/`

Install

```
python3 -m venv .venv
source .venv/bin/activate
pip install -r dejurescrape/requirements.txt
```

Usage

```
python -m dejurescrape --out data/dejure/cases --csv cases.csv --max-pages 0 --delay 2.0
```

- `--max-pages 0` means unlimited crawl; set a positive number to bound work.
- `--delay` seconds between requests.
- `--only-court BGH` limit to a court key if desired.

Output

- JSONL: one record per line: `{ "url", "court", "date", "file_number", ... }`
- CSV (optional): flattened subset of fields.

Notes

- The tool will skip fetching if robots.txt disallows paths or if pages include meta noindex/nofollow.
- Use responsibly. Consider `--delay` >= 1.0 and, if needed, `--max-pages` during testing.


