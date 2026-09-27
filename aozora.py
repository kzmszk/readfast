"""Official Aozora catalog and plain-text extraction (standard library only)."""
import csv
import io
import re
import threading
import time
import unicodedata
import zipfile
from functools import lru_cache
from html.parser import HTMLParser
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

CATALOG_URL = 'https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip'


def official_url(url):
    parts = urlsplit(url)
    if (parts.scheme not in ('http', 'https') or parts.netloc != 'www.aozora.gr.jp'
            or parts.query or parts.fragment or not re.fullmatch(
                r'/cards/\d+/(?:files/[\w.-]+\.html?|card\d+\.html)', parts.path)):
        raise ValueError('青空文庫内の対応する本文がありません。図書カードをご確認ください。')
    return 'https://www.aozora.gr.jp' + parts.path


class OfficialRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        official_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(url, limit):
    if url != CATALOG_URL:
        url = official_url(url)
    request = Request(url, headers={'User-Agent': 'readfast/0.1 (personal Aozora reader)'})
    with build_opener(OfficialRedirects()).open(request, timeout=25) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('作品のファイルが大きすぎるため読み込めませんでした。')
    return data


def normalize(text):
    text = unicodedata.normalize('NFKC', text).casefold()
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c
                   for c in text if not c.isspace())


def parse_catalog(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        member = archive.getinfo('list_person_all_extended_utf8.csv')
        if member.file_size > 40_000_000:
            raise ValueError('目録が大きすぎます。')
        rows = csv.DictReader(io.StringIO(archive.read(member).decode('utf-8-sig')))
        books = {}
        for row in rows:
            book_id = str(int(row['作品ID']))
            if book_id not in books:
                try:
                    html_url = official_url(row['XHTML/HTMLファイルURL'])
                    card_url = official_url(row['図書カードURL'])
                except ValueError:
                    continue
                books[book_id] = {
                    'id': book_id, 'title': row['作品名'], 'subtitle': row['副題'],
                    'orthography': row['文字遣い種別'], 'authors': [],
                    'url': html_url, 'cardUrl': card_url,
                    'encoding': row['XHTML/HTMLファイル符号化方式'],
                    '_search': '', '_sort': row['ソート用読み'],
                }
            book = books[book_id]
            name = ' '.join(filter(None, [row['姓'], row['名']]))
            role = row['役割フラグ']
            credit = name + (f'（{role}）' if role != '著者' else '')
            if credit not in book['authors']:
                book['authors'].append(credit)
            book['_search'] += '|' + normalize(' '.join(row.get(key, '') for key in (
                '作品名', '作品名読み', '副題', '副題読み', '姓', '名', '姓読み', '名読み',
                '姓ローマ字', '名ローマ字')))
        if not books:
            raise ValueError('目録に対応する作品がありませんでした。')
        return books


def public_book(book):
    return {key: value for key, value in book.items()
            if not key.startswith('_') and key != 'encoding'}


class Catalog:
    def __init__(self):
        self.books = {}
        self.updated = 0
        self.retry_after = 0
        self.lock = threading.Lock()

    def get(self):
        with self.lock:
            now = time.time()
            if now >= max(self.updated + 86400, self.retry_after):
                try:
                    books = parse_catalog(download(CATALOG_URL, 8_000_000))
                except Exception:
                    if not self.books:
                        raise
                    self.retry_after = now + 300
                else:
                    self.books, self.updated = books, now
            return self.books

    def search(self, query='', orthography='', page=1):
        terms = [normalize(term) for term in query.split()]
        matches = [book for book in self.get().values()
                   if all(term in book['_search'] for term in terms)
                   and (not orthography or book['orthography'] == orthography)]
        matches.sort(key=lambda book: (book['_sort'], book['id']))
        total = len(matches)
        pages = max(1, (total + 19) // 20)
        page = min(max(page, 1), pages)
        return {'books': [public_book(book) for book in matches[(page-1)*20:page*20]],
                'total': total, 'page': page, 'pages': pages,
                'stale': time.time() - self.updated > 86400}


class BodyParser(HTMLParser):
    """Read only main_text, preserving paragraphs and gaiji, excluding furigana."""
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.parts = []
        self.images = 0
        self.found = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        parent_active, parent_skip = self.stack[-1][1:] if self.stack else (False, False)
        active = parent_active or 'main_text' in attrs.get('class', '').split()
        skip = parent_skip or tag in ('rt', 'rp', 'script', 'style') or 'notes' in attrs.get('class', '').split()
        if active:
            self.found = True
        if active and not skip:
            if tag in ('br', 'p', 'div'):
                self.parts.append('\n')
            elif tag == 'img':
                alt = attrs.get('alt', '')
                code = re.search(r'U\+([0-9A-Fa-f]{4,6})', alt)
                if code and int(code[1], 16) <= 0x10ffff:
                    self.parts.append(chr(int(code[1], 16)))
                else:
                    self.parts.append(alt or '［挿図］')
                    self.images += 1
        if tag not in self.VOID:
            self.stack.append((tag, active, skip))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, -1, -1):
            if self.stack[i][0] == tag:
                if self.stack[i][1] and not self.stack[i][2] and tag in ('p', 'div'):
                    self.parts.append('\n')
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self.stack and self.stack[-1][1] and not self.stack[-1][2]:
            self.parts.append(data)

    def text(self):
        raw = ''.join(self.parts).replace('\r\n', '\n').replace('\r', '\n')
        text = re.sub(r'\n[ \t　]*\n(?:[ \t　]*\n)*', '\n\n', raw).strip()
        if not self.found or not text:
            raise ValueError('この作品の本文を抽出できませんでした。図書カードから原文をご確認ください。')
        return text


@lru_cache(maxsize=6)
def load_text(url, encoding):
    raw = download(url, 12_000_000)
    codec = 'utf-8-sig' if 'utf' in encoding.lower() else 'cp932'
    parser = BodyParser()
    parser.feed(raw.decode(codec))
    return parser.text(), parser.images


catalog = Catalog()
