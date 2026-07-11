@echo off
setlocal

rem Cloudflare / reverse-proxy: never expose passwordless auth on the internet.
if not defined RALAB_AUTH_MODE set RALAB_AUTH_MODE=proxy

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_ralab5_test.ps1" -ListenHost 127.0.0.1 -UseProxyHeaders -ForwardedAllowIps 127.0.0.1 %*

endlocal