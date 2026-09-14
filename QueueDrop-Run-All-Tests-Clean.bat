@echo off
setlocal
cd /d C:\queuedrop

echo.
echo Starting QueueDrop clean test runner...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0QueueDrop-Run-All-Tests-Clean.ps1"
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
    echo QueueDrop tests failed. Exit code: %EXITCODE%
) else (
    echo QueueDrop tests completed successfully.
)

exit /b %EXITCODE%
