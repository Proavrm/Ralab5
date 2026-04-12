@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "SCRIPT_PATH=%REPO_ROOT%scripts\build_ralab_rebuilt_2025_2026_package.py"
set "PROFILE_ARG=--profile reconciled-cfe"

if exist "%REPO_ROOT%Ralab5.venv\Scripts\python.exe" (
    "%REPO_ROOT%Ralab5.venv\Scripts\python.exe" "%SCRIPT_PATH%" %PROFILE_ARG% %*
    exit /b %ERRORLEVEL%
)

if exist "%REPO_ROOT%backend\current_fastapi\.venv\Scripts\python.exe" (
    "%REPO_ROOT%backend\current_fastapi\.venv\Scripts\python.exe" "%SCRIPT_PATH%" %PROFILE_ARG% %*
    exit /b %ERRORLEVEL%
)

where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    py "%SCRIPT_PATH%" %PROFILE_ARG% %*
    exit /b %ERRORLEVEL%
)

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    python "%SCRIPT_PATH%" %PROFILE_ARG% %*
    exit /b %ERRORLEVEL%
)

echo Python is required to build the reconciled package.
exit /b 1