@echo off
setlocal

cd /d "%~dp0"
set "openBrowserArg="

:menu
cls
echo ==============================
echo           RaLab5
echo ==============================
echo.
echo 1. Abrir em local
echo 2. Abrir via Cloudflare
echo 3. Desenvolvimento React ^(uvicorn + vite^)
echo 4. Sair
echo.
echo Depois da opcao 1 ou 2, podes pedir abertura automatica do browser.
echo.
set /p choice=Escolhe uma opcao ^(1-4^): 

if "%choice%"=="1" goto local
if "%choice%"=="2" goto cloudflare
if "%choice%"=="3" goto dev
if "%choice%"=="4" goto end

echo.
echo Opcao invalida.
pause
goto menu

:askBrowser
set "openBrowserArg="
set /p openBrowser=Abrir browser automaticamente? ^(S/N^): 
if /I "%openBrowser%"=="S" (
	set "openBrowserArg=-OpenBrowser"
	goto :eof
)
if /I "%openBrowser%"=="N" goto :eof
echo.
echo Opcao invalida.
goto askBrowser

:local
echo.
echo A abrir RaLab5 em local...
call :askBrowser
start "RaLab5 Local" "%~dp0launch_ralab5_test.cmd" %openBrowserArg%
goto end

:cloudflare
echo.
echo A abrir RaLab5 com Cloudflare...
call :askBrowser
start "RaLab5 Cloudflare" "%~dp0launch_ralab5_cloudflare.cmd" %openBrowserArg%
goto end

:dev
echo.
echo A abrir modo desenvolvimento...
start "RaLab5 Backend" "%~dp0launch_ralab5_test.cmd"
start "RaLab5 Frontend Dev" cmd /k "cd /d ""%~dp0frontend\react"" && npm run dev"
goto end

:end
endlocal