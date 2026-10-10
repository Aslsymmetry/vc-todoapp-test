#!/bin/bash
# 더블클릭해서 실행하거나 Terminal에서 bash 맥에서-실행.command 로 실행
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "오류: Python 3가 설치되어 있지 않습니다. Python 3.8 이상을 설치한 후 다시 실행하세요."
  echo "설치 안내: https://www.python.org/downloads/"
  read -r -p "Enter 키를 누르면 창이 닫힙니다..." _
  exit 1
fi
python3 server.py
status=$?
echo
echo "서버 실행이 끝났습니다. (종료 코드: $status)"
read -r -p "Enter 키를 누르면 창이 닫힙니다..." _
exit "$status"
