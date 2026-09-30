@echo off
chcp 65001 > nul
title Servidor Local - Consulta Càrrecs OGS

echo =======================================================
echo   Iniciant servidor local per a Consulta Càrrecs OGS
echo =======================================================
echo.

set PORT=8000

:: Intentar Python 3
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] S'ha trobat Python. Iniciant servidor a http://localhost:%PORT%...
    start http://localhost:%PORT%/index.html
    python -m http.server %PORT%
    goto END
)

:: Intentar Python (python3 command)
where python3 >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] S'ha trobat Python3. Iniciant servidor a http://localhost:%PORT%...
    start http://localhost:%PORT%/index.html
    python3 -m http.server %PORT%
    goto END
)

:: Intentar npx (Node.js)
where npx >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] S'ha trobat Node.js / npx. Iniciant servidor a http://localhost:%PORT%...
    start http://localhost:%PORT%/index.html
    npx -y http-server -p %PORT%
    goto END
)

:: Fallback amb PowerShell Simple HTTP Server integrat
echo [INFO] Utilitzant PowerShell per servir l'aplicació a http://localhost:%PORT%...
start http://localhost:%PORT%/index.html
powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://localhost:%PORT%/'); $listener.Start(); Write-Host 'Servidor actiu a http://localhost:%PORT%/'; while ($listener.IsListening) { $context = $listener.GetContext(); $request = $context.Request; $response = $context.Response; $localPath = (Join-Path (Get-Location) $request.Url.LocalPath.TrimStart('/')); if (Test-Path $localPath -PathType Leaf) { $bytes = [System.IO.File]::ReadAllBytes($localPath); $ext = [System.IO.Path]::GetExtension($localPath).ToLower(); switch ($ext) { '.html' { $response.ContentType = 'text/html; charset=utf-8' } '.js' { $response.ContentType = 'application/javascript; charset=utf-8' } '.css' { $response.ContentType = 'text/css; charset=utf-8' } '.json' { $response.ContentType = 'application/json; charset=utf-8' } default { $response.ContentType = 'application/octet-stream' } } $response.ContentLength64 = $bytes.Length; $response.OutputStream.Write($bytes, 0, $bytes.Length); } else { $response.StatusCode = 404; } $response.Close(); }"

:END
pause
