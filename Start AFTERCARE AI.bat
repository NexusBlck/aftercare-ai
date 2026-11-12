@echo off
title AFTERCARE AI
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First run: installing dependencies. This takes a few minutes...
  call npm install
  if errorlevel 1 goto :fail
)

if not exist ".next\BUILD_ID" (
  echo Preparing the app. This takes about a minute the first time...
  call npm run build
  if errorlevel 1 goto :fail
)

rem Open the browser as soon as the server answers.
if not defined AFTERCARE_NO_BROWSER (
  start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 90;$i++){try{Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/api/health' -TimeoutSec 2 | Out-Null; Start-Process 'http://localhost:3000'; break}catch{Start-Sleep -Seconds 1}}"
)

echo.
echo  AFTERCARE AI is starting at http://localhost:3000
echo  Keep this window open while you use the app. Close it to stop AFTERCARE AI.
echo.
call npx next start -p 3000
goto :eof

:fail
echo.
echo Something went wrong. Scroll up to see the error, or delete the ".next" folder and try again.
pause
exit /b 1
