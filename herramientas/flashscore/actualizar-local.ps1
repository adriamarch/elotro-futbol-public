# Actualiza los datos de jugadores desde Flashscore y los publica. Para Windows (PowerShell).
# Uso (desde la raíz del repo elotro-futbol-public):   powershell -ExecutionPolicy Bypass -File herramientas\flashscore\actualizar-local.ps1
# Parámetros:  -SinDescubrir (usa equipos.json tal cual)   -SinDesplegar (solo descarga)
param([switch]$SinDescubrir, [switch]$SinDesplegar)
$ErrorActionPreference = "Stop"
$raiz = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $raiz

$y = (Get-Date).Year; $m = (Get-Date).Month
$temporada = if ($m -ge 7) { "$y/$($y+1)" } else { "$($y-1)/$y" }
Write-Host "Temporada: $temporada"

python -m pip install -q -r herramientas\lapreferente\requirements.txt
node herramientas\lapreferente\exportar_clubes.mjs
if (-not $SinDescubrir) { python herramientas\flashscore\flashscore.py descubrir-todo }
python herramientas\flashscore\flashscore.py plantillas --temporada $temporada --max-problemas 10
if ($LASTEXITCODE -ne 0) { throw "Demasiados clubes con problemas: no se publica nada." }

# /estadisticas lee ESTOS agregados, no los JSON de cada club: sin este paso los tops se quedan viejos.
python herramientas\flashscore\estadisticas.py
if ($LASTEXITCODE -ne 0) { throw "Fallo al generar las estadisticas agregadas." }

if (-not $SinDesplegar) {
  npx wrangler deploy
}
Write-Host "Listo."
