@echo off
cd /d %~dp0
if not exist node_modules\ws (
  echo Installing... 
  call npm install --omit=dev
)
echo Starting HAUTERRE CINEMA ... http://localhost:8080
start "" http://localhost:8080
node server\relay.mjs
pause
