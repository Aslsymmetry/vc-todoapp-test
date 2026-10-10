@echo off
chcp 65001 >nul
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 (
  py -3 -c "import sys; sys.exit(sys.version_info < (3, 8))" >nul 2>nul
  if not errorlevel 1 (
    py -3 server.py
    goto end
  )
)
where python >nul 2>nul
if not errorlevel 1 (
  python -c "import sys; sys.exit(sys.version_info < (3, 8))" >nul 2>nul
  if not errorlevel 1 (
    python server.py
    goto end
  )
)
echo 오류: Python 3.8 이상이 필요합니다.
echo https://www.python.org/downloads/ 에서 설치하세요.
:end
echo.
echo 서버 실행이 끝났습니다. 이 창을 닫아도 됩니다.
pause
