#!/usr/bin/env python3
"""Non-destructive structure checks; not a live Firebase verification."""
from pathlib import Path
from html.parser import HTMLParser
import json
import re
ROOT = Path(__file__).resolve().parents[1]
class IDs(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids = []
    def handle_starttag(self, tag, attrs):
        self.ids.extend(value for key, value in attrs if key == 'id')
html = (ROOT / 'public/index.html').read_text()
parser = IDs(); parser.feed(html)
assert len(parser.ids) == len(set(parser.ids)), 'duplicate DOM IDs'
app = (ROOT / 'public/app.js').read_text()
store = (ROOT / 'public/store.js').read_text()
config = (ROOT / 'public/config.js').read_text()
assert set(re.findall(r"\$\('([^']+)'\)", app)).issubset(parser.ids), 'missing DOM element'
assert {'task-dialog','task-form','task-list','add-btn','save-btn','form-error','retry-btn'}.issubset(parser.ids)
for source in [app, store, config, html]:
    assert not any(s in source for s in ['firebase-auth', 'createUserWithEmailAndPassword', 'signInAnonymously', 'signInWithEmailAndPassword', 'type="password"', 'localStorage.setItem']), 'unexpected authentication/local persistence'
assert "credentials: 'omit'" in store and 'withCredentials: false' in store
assert 'todo-backend-8ac43-default-rtdb.firebaseio.com' in config
assert "TODO_PATH = 'sharedTodos'" in config
assert 'if-match' in store and 'null_etag' in store and "response.status === 412" in store
rules = json.loads((ROOT / 'database.rules.json').read_text())['rules']
assert rules['.read'] is False and rules['.write'] is False
assert rules['sharedTodos']['.read'] is True
assert rules['sharedTodos']['$todoId']['$other']['.validate'] is False
assert json.loads((ROOT / 'vercel.json').read_text())['outputDirectory'] == 'public'
print('PASS: DOM references, no Auth/local DB, existing Firebase URL, conditional writes, shared rules, Vercel')
