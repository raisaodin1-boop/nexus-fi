@echo off
echo Lancement de HODIX...
start "Backend HODIX" cmd /k "cd /d C:\Users\surface\hodixemergent\backend && py -3.11 -m uvicorn server:app --host 0.0.0.0 --port 8000"
timeout /t 3 /nobreak >nul
start "Frontend HODIX" cmd /k "cd /d C:\Users\surface\hodixemergent\frontend && npx expo start --dev-client --tunnel"
timeout /t 5 /nobreak >nul
start http://localhost:8081
