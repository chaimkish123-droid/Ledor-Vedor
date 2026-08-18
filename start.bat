@echo off
REM Double-click this to start L'Dor VaDor.
REM
REM %~dp0 is the folder this file is in, so it works wherever you put it
REM and whatever folder a terminal happens to be pointing at.

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"

echo.
echo Press any key to close this window.
pause >nul
