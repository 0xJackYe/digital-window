@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if errorlevel 1 goto folder_error

if exist "%~dp0release\数字窗户-win32-x64\数字窗户.exe" (
  start "" "%~dp0release\数字窗户-win32-x64\数字窗户.exe" %*
  exit /b 0
)

if exist "%~dp0node_modules\.bin\electron.cmd" goto source_launch

echo Digital Window dependencies are not installed.
echo Open a terminal in this folder and run:
echo   npm install
echo Then double-click this launcher again.
pause
exit /b 1

:source_launch
call "%~dp0node_modules\.bin\electron.cmd" . %*
exit /b %errorlevel%

:folder_error
echo Cannot open the Digital Window project folder.
pause
exit /b 1
