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
echo 3. Desenvolvimento React ^(API :8000 + Vite :5173^)
echo 4. Sair
echo 5. Apresentacao ^(labo@nge.fr / RaLab5-Demo, admin demo^)
echo.
echo Opcoes 1 e 2: build + http://localhost:8000 ^(ficheiros em dist^)
echo Opcao 3: edita src e abre http://localhost:5173 ^(hot reload^)
echo Opcao 5: tunnel trycloudflare — email labo@nge.fr, passe RaLab5-Demo
echo Depois da opcao 1 ou 2, podes pedir abertura automatica do browser.
echo.
set /p choice=Escolhe uma opcao ^(1-5^): 

if "%choice%"=="1" goto local
if "%choice%"=="2" goto cloudflare
if "%choice%"=="3" goto dev
if "%choice%"=="4" goto end
if "%choice%"=="5" goto apresentacao

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

:apresentacao
echo.
echo Modo apresentacao ^(so opcao 5^):
echo   Email: labo@nge.fr
echo   Passe: RaLab5-Demo
echo   URL: copiar da janela cloudflared apos arranque
echo.
set /p openBrowserAp=Abrir http://localhost:8000 no browser? ^(S/N^): 
set "apresentacaoArgs="
if /I "%openBrowserAp%"=="S" set "apresentacaoArgs=-OpenBrowser"
start "RaLab5 Apresentacao" "%~dp0launch_ralab5_apresentacao.cmd" %apresentacaoArgs%
goto end

:askDevBrowser
set "openDevBrowser="
set /p openDevBrowser=Abrir http://localhost:5173 no browser? ^(S/N^): 
if /I "%openDevBrowser%"=="S" (
	set "openDevBrowser=1"
	goto :eof
)
if /I "%openDevBrowser%"=="N" (
	set "openDevBrowser="
	goto :eof
)
echo.
echo Opcao invalida.
goto askDevBrowser

:dev
echo.
echo Modo desenvolvimento:
echo   API:      http://localhost:8000  ^(-SkipBuild -Reload^)
echo   Frontend: http://localhost:5173  ^(alteracoes em src^)
echo.
call :askDevBrowser
echo A iniciar backend...
start "RaLab5 Backend" "%~dp0launch_ralab5_test.cmd" -SkipBuild -Reload
echo A iniciar Vite...
start "RaLab5 Frontend Dev" cmd /k "cd /d ""%~dp0frontend\react"" && npm run dev"
if defined openDevBrowser (
	echo A aguardar Vite ^(~4 s^)...
	timeout /t 4 /nobreak >nul
	start "" "http://localhost:5173/"
)
goto end

:end
endlocal