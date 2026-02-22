# Use Node.js from system PATH (v22.22.0)
Set-Location $PSScriptRoot

$NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($NodeCommand) {
    Write-Host "Found Node at: $($NodeCommand.Source)"
    & $NodeCommand.Source -v
} else {
    Write-Error "node.exe not found in PATH!"
    exit 1
}

Write-Host "Starting Vite with System Node..." -ForegroundColor Cyan

# Define path to Vite executable
$VitePath = ".\node_modules\vite\bin\vite.js"

# Verify Vite path
if (!(Test-Path $VitePath)) {
    Write-Error "Vite not found at $VitePath"
    exit 1
}

# Launch Vite with network access
Write-Host "Launching Vite..." -ForegroundColor Green
Write-Host "Network access enabled on 0.0.0.0:3000" -ForegroundColor Yellow
try {
    & $NodeCommand.Source $VitePath --host 0.0.0.0 $args
} catch {
    Write-Error "Failed to start Vite: $_"
    exit 1
}
