"""Generate the deploy-time catalog using the same parser as the local server."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from aozora import CATALOG_URL, download, parse_catalog

books = list(parse_catalog(download(CATALOG_URL, 8_000_000)).values())
books.sort(key=lambda book: (book['_sort'], book['id']))
for book in books:
    del book['_sort']
data = {'updatedAt': datetime.now(timezone.utc).isoformat(), 'books': books}
target = ROOT / '.generated' / 'catalog.json'
target.parent.mkdir(exist_ok=True)
temporary = target.with_suffix('.tmp')
temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
temporary.replace(target)
print(f'Generated {len(books):,} Aozora books ({target.stat().st_size:,} bytes).')
