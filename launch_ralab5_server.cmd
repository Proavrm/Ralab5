@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_ralab5_test.ps1" -ListenHost 127.0.0.1 -UseProxyHeaders -ForwardedAllowIps 127.0.0.1 %*

endlocal