@echo off
REM Double-click this to stop L'Dor VaDor.
REM
REM Your family's archive is on a Docker volume and is not touched by this.
REM Everything is exactly where you left it when you start it again.

cd /d "%~dp0"

echo Stopping L'Dor VaDor...
echo.
docker compose down

echo.
echo Stopped. Your family's archive is safe - start.bat brings it back.
echo.
echo Press any key to close this window.
pause >nul
