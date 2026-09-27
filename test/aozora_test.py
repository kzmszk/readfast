import csv
import io
import unittest
import zipfile
from unittest.mock import patch

from aozora import BodyParser, Catalog, load_text, official_url, parse_catalog


def catalog_zip(rows):
    text = io.StringIO()
    fields = ['作品ID', '作品名', '作品名読み', 'ソート用読み', '副題', '副題読み',
              '文字遣い種別', '図書カードURL', 'XHTML/HTMLファイルURL',
              'XHTML/HTMLファイル符号化方式', '姓', '名', '姓読み', '名読み', '役割フラグ']
    writer = csv.DictWriter(text, fieldnames=fields)
    writer.writeheader()
    base = dict.fromkeys(fields, '')
    base.update({'作品ID': '000001', '作品名': '教祖の文学', '作品名読み': 'きょうそのぶんがく',
                 'ソート用読み': 'きようそのふんかく', '副題': '小林秀雄論',
                 '文字遣い種別': '新字新仮名', '姓': '坂口', '名': '安吾',
                 '姓読み': 'さかぐち', '名読み': 'あんご', '役割フラグ': '著者',
                 '図書カードURL': 'http://www.aozora.gr.jp/cards/001095/card1.html',
                 'XHTML/HTMLファイルURL': 'https://www.aozora.gr.jp/cards/001095/files/1_2.html',
                 'XHTML/HTMLファイル符号化方式': 'ShiftJIS'})
    for row in rows:
        writer.writerow({**base, **row})
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as archive:
        archive.writestr('list_person_all_extended_utf8.csv', text.getvalue())
    return out.getvalue()


class AozoraTest(unittest.TestCase):
    def test_body_preserves_paragraphs_and_excludes_ruby_notes_footer(self):
        parser = BodyParser()
        parser.feed('<h1>書名</h1><div class="main_text">'
                    '水<ruby><rb>道橋</rb><rp>（</rp><rt>どうばし</rt><rp>）</rp></ruby>。<br />'
                    '<div>次の文。<span class="notes">［＃編集注］</span></div>終わり。'
                    '</div><div>底本：出版社</div>')
        self.assertEqual(parser.text(), '水道橋。\n\n次の文。\n終わり。')

    def test_nested_elements_and_gaiji(self):
        parser = BodyParser()
        parser.feed('<div class="main_text"><div><em>引用</em></div>'
                    '<img alt="※［＃U+20BB7］" /><img alt="［挿絵］" />終</div>巻末')
        self.assertEqual(parser.text(), '引用\n𠮷［挿絵］終')
        self.assertEqual(parser.images, 1)

    def test_missing_body_fails_instead_of_loading_navigation(self):
        parser = BodyParser()
        parser.feed('<p>見つかりません</p>')
        with self.assertRaises(ValueError):
            parser.text()

    def test_official_urls_only(self):
        self.assertEqual(official_url('http://www.aozora.gr.jp/cards/1/files/1_2.html'),
                         'https://www.aozora.gr.jp/cards/1/files/1_2.html')
        for url in ['http://127.0.0.1/private', 'https://www.aozora.gr.jp.evil/cards/1/files/a.html',
                    'file:///etc/passwd', 'https://www.aozora.gr.jp/cards/1/files/../../secret.html',
                    'https://www.aozora.gr.jp:443/cards/1/files/a.html',
                    'https://www.aozora.gr.jp/cards/1/files/a.html?url=secret']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                official_url(url)

    def test_catalog_deduplicates_contributors_and_skips_external_files(self):
        books = parse_catalog(catalog_zip([{}, {'姓': '翻訳', '名': '太郎', '役割フラグ': '翻訳者'},
                                          {'作品ID': '2', 'XHTML/HTMLファイルURL': 'https://example.com/book.html'}]))
        self.assertEqual(len(books), 1)
        self.assertEqual(books['1']['authors'], ['坂口 安吾', '翻訳 太郎（翻訳者）'])

    def test_search_kana_multiple_terms_and_pagination(self):
        data = catalog_zip([{'作品ID': str(i)} for i in range(1, 24)] +
                           [{'作品ID': '24', '文字遣い種別': '旧字旧仮名'}])
        with patch('aozora.download', return_value=data) as fetch:
            catalog = Catalog()
            result = catalog.search('ｻｶｸﾞﾁ ｱﾝｺﾞ 小林', '新字新仮名', 2)
            self.assertEqual((result['total'], len(result['books']), result['page']), (23, 3, 2))
            self.assertEqual(catalog.search('存在しない')['total'], 0)
            self.assertEqual(catalog.search('教祖', page=999)['page'], 2)
            self.assertEqual(fetch.call_count, 1)

    def test_stale_catalog_is_retained_on_network_failure(self):
        with patch('aozora.download', return_value=catalog_zip([{}])):
            catalog = Catalog()
            catalog.get()
        catalog.updated = 1
        with patch('aozora.download', side_effect=TimeoutError) as fetch:
            self.assertTrue(catalog.search()['stale'])
            self.assertEqual(catalog.search()['total'], 1)
            self.assertEqual(fetch.call_count, 1)

    def test_shift_jis_and_utf8_decoding(self):
        for codec, label in [('cp932', 'ShiftJIS'), ('utf-8-sig', 'UTF-8')]:
            with self.subTest(codec=codec):
                load_text.cache_clear()
                raw = '<div class="main_text">漢字とカナ。</div>'.encode(codec)
                with patch('aozora.download', return_value=raw):
                    self.assertEqual(load_text('https://www.aozora.gr.jp/cards/1/files/a.html', label),
                                     ('漢字とカナ。', 0))
        load_text.cache_clear()
