#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""하루 로컬 웹서버: Python 표준 라이브러리만 사용합니다."""

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import threading
from urllib.parse import urlsplit
import webbrowser

HOST = '127.0.0.1'  # 이 컴퓨터에서만 접속 허용
PORT = 3000
APP_DIR = Path(__file__).resolve().parent / 'public'
APP_FILES = {'/index.html': ('index.html', 'text/html; charset=utf-8')}
APP_FILES.update({f'/{name}': (name, 'text/javascript; charset=utf-8') for name in ('app.js', 'config.js', 'store.js')})
URL = f'http://{HOST}:{PORT}/index.html'


class AppHandler(BaseHTTPRequestHandler):
    server_version = 'HaruLocal/1.0'

    def send_plain(self, code, message, send_body=True):
        body = message.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        if send_body:
            self.wfile.write(body)

    def serve_app(self, send_body=True):
        path = urlsplit(self.path).path
        if path == '/':
            self.send_response(302)
            self.send_header('Location', '/index.html')
            self.send_header('Content-Length', '0')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            return
        if path == '/favicon.ico':
            self.send_response(204)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if path not in APP_FILES:
            self.send_plain(404, '페이지를 찾을 수 없습니다.', send_body)
            return
        name, content_type = APP_FILES[path]
        try:
            content = (APP_DIR / name).read_bytes()
        except OSError as exc:
            print('오류: index.html을 읽지 못했습니다:', exc, file=sys.stderr)
            self.send_plain(500, '앱 파일을 읽을 수 없습니다.', send_body)
            return
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.end_headers()
        if send_body:
            self.wfile.write(content)

    def do_GET(self):
        self.serve_app()

    def do_HEAD(self):
        self.serve_app(False)

    def do_POST(self):
        self.send_plain(405, '이 서버는 파일 변경 요청을 받지 않습니다.')

    def log_message(self, fmt, *args):
        # 정상적인 접속 로그만 출력 (로컬 구동 상태 확인용)
        print('[접속]', fmt % args)


def main():
    if sys.version_info < (3, 8):
        print('오류: Python 3.8 이상 버전이 필요합니다.', file=sys.stderr)
        return 1

    parser = argparse.ArgumentParser(description='하루 할 일 앱 로컬 서버')
    parser.add_argument('--no-browser', action='store_true', help='브라우저 자동 실행하지 않음')
    args = parser.parse_args()

    if not all((APP_DIR / name).is_file() for name, _ in APP_FILES.values()):
        print('오류: public 폴더에 index.html, app.js, config.js, store.js가 있어야 합니다.', file=sys.stderr)
        return 1

    try:
        httpd = ThreadingHTTPServer((HOST, PORT), AppHandler)
    except OSError as exc:
        print(f'서버를 시작하지 못했습니다: {exc}', file=sys.stderr)
        print(f'포트 {PORT}을 다른 프로그램이 사용하고 있을 수 있습니다.', file=sys.stderr)
        print('기존 서버를 확인한 후 다시 실행하세요. 다른 프로그램을 자동 종료하지 않습니다.', file=sys.stderr)
        return 1

    print('\n=== 하루 · 할 일 관리 로컬 웹앱 ===', flush=True)
    print('접속 주소:', URL, flush=True)
    print('종료: 이 창에서 Ctrl+C (또는 실행한 터미널 창 닫기)', flush=True)
    print('할 일 데이터는 Firebase Realtime Database에 저장됩니다.', flush=True)
    print('네트워크 외부 접속은 허용하지 않습니다.\n', flush=True)

    if not args.no_browser:
        timer = threading.Timer(0.4, lambda: webbrowser.open(URL))
        timer.daemon = True
        timer.start()

    try:
        httpd.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        print('\n서버를 종료합니다.', flush=True)
    finally:
        httpd.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
