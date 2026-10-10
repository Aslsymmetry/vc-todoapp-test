#!/usr/bin/env python3
"""Python 표준 라이브러리만 사용하는 비파괴 정적 검사."""
from pathlib import Path
from html.parser import HTMLParser
import json

ROOT = Path(__file__).resolve().parents[1]

class IDs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key == 'id': self.ids.append(value)

html = (ROOT / 'public/index.html').read_text(encoding='utf-8')
js = (ROOT / 'public/app.js').read_text(encoding='utf-8')
parser = IDs(); parser.feed(html)
assert len(parser.ids) == len(set(parser.ids)), 'HTML ID duplicated'
required = ['task-dialog','task-form','task-list','add-btn',
            'save-btn','read-test-btn','write-test-btn','diagnostic-path','import-btn']
assert set(required).issubset(parser.ids), 'required DOM element missing'
assert 'firebasejs/13.0.0/firebase-app.js' in js
assert 'firebasejs/13.0.0/firebase-database.js' in js
assert 'firebase-auth' not in js and 'createUserWithEmailAndPassword' not in js
assert 'auth-form' not in parser.ids and 'auth-overlay' not in parser.ids
assert 'getDatabase(app)' in js and 'onValue(tasksRef' in js
assert 'todo-backend-8ac43-default-rtdb.firebaseio.com' in js
assert "return `sharedTodos" in js
assert 'localStorage.setItem' not in js
rules = json.loads((ROOT/'database.rules.json').read_text(encoding='utf-8'))['rules']
assert rules['.read'] is False and rules['.write'] is False
assert rules['sharedTodos']['.read'] is True
assert rules['sharedTodos']['$todoId']['$other']['.validate'] is False
vercel = json.loads((ROOT/'vercel.json').read_text(encoding='utf-8'))
assert vercel['outputDirectory'] == 'public'
assert (ROOT/'server.py').is_file()
print('PASS: HTML ID / account-free RTDB code / shared-path rules / Vercel static settings')
