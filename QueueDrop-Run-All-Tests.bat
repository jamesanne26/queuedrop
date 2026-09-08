@echo off
setlocal EnableExtensions EnableDelayedExpansion

title QueueDrop - Run All Automated Tests

REM ============================================================
REM QueueDrop - Full Automated Test Runner
REM Place this BAT file in the QueueDrop project root folder.
REM It automatically runs from the folder where this BAT is saved.
REM ============================================================

cd /d "%~dp0"

echo.
echo ========================================
echo QUEUEDROP - FULL AUTOMATED TEST RUN
echo ========================================
echo Project: %CD%
echo Started: %DATE% %TIME%
echo.

REM ------------------------------------------------------------
REM PRE-FLIGHT CHECKS
REM ------------------------------------------------------------

if not exist "package.json" (
    echo [ERROR] package.json not found.
    echo.
    echo Put this BAT file inside the QueueDrop project root folder.
    echo Example: C:\queuedrop\run-all-tests.bat
    echo.
    goto :fail
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not available in PATH.
    goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed or not available in PATH.
    goto :fail
)

echo Node:
node --version
echo npm:
call npm --version
echo.

REM ------------------------------------------------------------
REM OPTIONAL DEPENDENCY CHECK
REM ------------------------------------------------------------

if not exist "node_modules" (
    echo [INFO] node_modules not found.
    echo [RUN ] npm ci
    call npm ci
    if errorlevel 1 goto :failed_step
    echo.
)

REM ------------------------------------------------------------
REM TEST PIPELINE
REM ------------------------------------------------------------

call :run "Lint"                    "npm run lint"
call :run "TypeScript type check"   "npm run typecheck"
call :run "Unit tests"              "npm run test:unit"
call :run "SMS tests"               "npm run test:sms"
call :run "Secret security scan"    "npm run security:secrets"
call :run "Integration tests"       "npm run test:integration:required"
call :run "Production build"        "npm run build"
call :run "End-to-end tests"        "npm run test:e2e"

echo.
echo ========================================
echo ALL QUEUEDROP AUTOMATED TESTS PASSED
echo ========================================
echo Finished: %DATE% %TIME%
echo.
pause
exit /b 0


REM ============================================================
REM FUNCTIONS
REM ============================================================

:run
set "STEP_NAME=%~1"
set "STEP_COMMAND=%~2"

echo.
echo ----------------------------------------
echo [RUN] %STEP_NAME%
echo ----------------------------------------
echo Command: %STEP_COMMAND%
echo.

call %STEP_COMMAND%

if errorlevel 1 (
    set "FAILED_STEP=%STEP_NAME%"
    goto :failed_step
)

echo.
echo [PASS] %STEP_NAME%
exit /b 0


:failed_step
echo.
echo ========================================
echo QUEUEDROP AUTOMATED TESTS FAILED
echo ========================================
if defined FAILED_STEP echo Failed step: %FAILED_STEP%
echo Exit code: %ERRORLEVEL%
echo Finished: %DATE% %TIME%
echo.
pause
exit /b %ERRORLEVEL%


:fail
echo.
echo ========================================
echo QUEUEDROP TEST RUNNER COULD NOT START
echo ========================================
echo.
pause
exit /b 1
