"""Local static server plus read-only Aozora endpoints."""
import argparse
import json
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.error import URLError

from aozora import catalog, load_text, public_book

PUBLIC = Path(__file__).parent / 'public'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def json(self, status, data):
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlsplit(self.path)
        if not parsed.path.startswith('/api/'):
            return super().do_GET()
        try:
            if parsed.path == '/api/aozora/search':
                params = parse_qs(parsed.query)
                query = params.get('q', [''])[0][:200]
                orthography = params.get('orthography', [''])[0]
                page = params.get('page', ['1'])[0]
                if not re.fullmatch(r'\d{1,6}', page):
                    return self.json(400, {'error': 'ページ番号が正しくありません。'})
                return self.json(200, catalog.search(query, orthography, int(page)))
            match = re.fullmatch(r'/api/aozora/books/(\d{1,6})', parsed.path)
            if match:
                book = catalog.get().get(str(int(match[1])))
                if book is None:
                    return self.json(404, {'error': '目録に作品が見つかりません。'})
                text, images = load_text(book['url'], book['encoding'])
                return self.json(200, {**public_book(book), 'text': text, 'images': images})
            self.json(404, {'error': '指定された機能はありません。'})
        except ValueError as error:
            self.json(422, {'error': str(error)})
        except (URLError, TimeoutError, OSError):
            self.json(502, {'error': '青空文庫に接続できませんでした。時間をおいて、もう一度お試しください。'})
        except Exception:
            self.json(502, {'error': '青空文庫のデータを読み込めませんでした。時間をおいて、もう一度お試しください。'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4173)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'readfast: http://127.0.0.1:{args.port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
