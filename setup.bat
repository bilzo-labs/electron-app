@echo off
REM Bilzo Receipt Sync - Windows Setup Script

echo ======================================
echo Bilzo Receipt Sync - Setup Script
echo ======================================
echo.

REM Check Node.js
echo Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo X Node.js is not installed. Please install Node.js v18 or higher.
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)

echo √ Node.js version:
node --version
echo.

REM Check .env file
echo Checking configuration...
if not exist .env (
    echo ! .env file not found. Creating from template...
    copy .env.example .env
    echo √ Created .env file
    echo.
    echo IMPORTANT: Edit .env and configure:
    echo   - SQL Server credentials
    echo   - API keys
    echo   - Store/Organization IDs
    echo.
    echo Opening .env file in notepad...
    start notepad .env
    echo.
    pause
) else (
    echo √ .env file exists
)
echo.

REM Install dependencies
echo Installing dependencies...
call npm install

if errorlevel 1 (
    echo X Failed to install dependencies
    pause
    exit /b 1
)

echo √ Dependencies installed
echo.

REM Check for icon files
echo Checking icon files...
set ICONS_MISSING=0

if not exist assets\icon-idle.png (
    echo ! Missing: assets\icon-idle.png
    set ICONS_MISSING=1
)

if not exist assets\icon-syncing.png (
    echo ! Missing: assets\icon-syncing.png
    set ICONS_MISSING=1
)

if not exist assets\icon-error.png (
    echo ! Missing: assets\icon-error.png
    set ICONS_MISSING=1
)

if not exist assets\icon.ico (
    echo ! Missing: assets\icon.ico
    set ICONS_MISSING=1
)

if %ICONS_MISSING%==1 (
    echo.
    echo Icon files are missing. Please add them before building.
    echo See assets\ICONS_README.md for instructions.
    echo.
    echo TIP: Use Bilzo favicon as the base icon
) else (
    echo √ All icon files present
)
echo.

REM Setup complete
echo ======================================
echo Setup Complete!
echo ======================================
echo.
echo Next steps:
echo.
echo 1. Configure .env file with your credentials
echo 2. Add icon files to assets\ directory
echo 3. Run in development mode:
echo    npm run dev
echo.
echo 4. Build for production:
echo    npm run build:win
echo.
echo For more information, see README.md
echo.
pause
