# clasp-login.ps1
# Usage: PowerShell -> .\scripts\clasp-login.ps1
# Runs `clasp login --no-localhost`, streams output, and opens the authorization URL automatically.

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "clasp"
$psi.Arguments = "login --no-localhost"
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true

$p = New-Object System.Diagnostics.Process
$p.StartInfo = $psi
$p.Start() | Out-Null

$reader = $p.StandardOutput
$errReader = $p.StandardError
$opened = $false

while (-not $p.HasExited) {
    Start-Sleep -Milliseconds 100
    while (-not $reader.EndOfStream) {
        $line = $reader.ReadLine()
        Write-Host $line
        if (-not $opened -and $line -match "(https?://[^\s]+)") {
            $url = $Matches[1]
            try { Start-Process $url } catch { Write-Host "Failed to open browser: $_" }
            $opened = $true
        }
    }
    while (-not $errReader.EndOfStream) {
        $eline = $errReader.ReadLine()
        Write-Host $eline
        if (-not $opened -and $eline -match "(https?://[^\s]+)") {
            $url = $Matches[1]
            try { Start-Process $url } catch { Write-Host "Failed to open browser: $_" }
            $opened = $true
        }
    }
}

# Drain any remaining output
while (-not $reader.EndOfStream) { $line = $reader.ReadLine(); Write-Host $line }
while (-not $errReader.EndOfStream) { $line = $errReader.ReadLine(); Write-Host $line }
$p.WaitForExit()
