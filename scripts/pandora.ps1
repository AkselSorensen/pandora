param(
  [Parameter(Position = 0)]
  [string]$Command = "help",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$ErrorActionPreference = "Stop"

function Compose {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  & docker compose @Args
}

function Show-Help {
  Write-Host "Pandora commands (PowerShell)" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "Global:"
  Write-Host "  ./make.ps1 up              Start the full stack"
  Write-Host "  ./make.ps1 down            Stop and remove the stack"
  Write-Host "  ./make.ps1 restart         Rebuild/restart the full stack"
  Write-Host "  ./make.ps1 restart-fast    Restart containers without rebuild"
  Write-Host "  ./make.ps1 clean           Down + remove orphans"
  Write-Host "  ./make.ps1 ps              Show containers"
  Write-Host "  ./make.ps1 logs            Follow all logs"
  Write-Host ""
  Write-Host "Per service:"
  Write-Host "  ./make.ps1 pandora         Rebuild/restart web app only"
  Write-Host "  ./make.ps1 grafana         Grafana + Prometheus + exporters"
  Write-Host "  ./make.ps1 obs             Alias observability"
  Write-Host "  ./make.ps1 metrics         Rebuild/restart pandora-metrics"
  Write-Host "  ./make.ps1 ai              Rebuild/restart pandora-ai"
  Write-Host "  ./make.ps1 digest          Rebuild/restart pandora-digest"
  Write-Host "  ./make.ps1 alerts          Rebuild/restart pandora-alerts"
  Write-Host "  ./make.ps1 ontology        Rebuild/restart pandora-ontology"
  Write-Host "  ./make.ps1 cases           Rebuild/restart pandora-cases"
  Write-Host "  ./make.ps1 hotspots        Rebuild/restart pandora-hotspots"
  Write-Host "  ./make.ps1 copilot         Rebuild/restart pandora-copilot"
  Write-Host "  ./make.ps1 risk            Rebuild/restart pandora-risk"
  Write-Host ""
  Write-Host "Tools:"
  Write-Host "  ./make.ps1 build           npm run build"
  Write-Host "  ./make.ps1 lint            npm run lint"
  Write-Host "  ./make.ps1 urls            Print useful URLs"
  Write-Host "  ./make.ps1 health          Quick health checks"
  Write-Host ""
  Write-Host "Tip: if PowerShell blocks scripts, run:" -ForegroundColor Yellow
  Write-Host "  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned"
}

function Show-Urls {
  Write-Host "Pandora UI:          http://localhost:3001"
  Write-Host "Grafana:             http://localhost:3002  (admin / pandora)"
  Write-Host "Prometheus:          http://localhost:9090"
  Write-Host "cAdvisor:            http://localhost:8080"
  Write-Host "Blackbox exporter:   http://localhost:9115"
  Write-Host "Pandora Metrics:     http://localhost:7710/metrics"
  Write-Host "Digest:              http://localhost:3001/digest"
  Write-Host "Alerts:              http://localhost:3001/alerts"
  Write-Host "Ontology:            http://localhost:3001/ontology"
  Write-Host "Cases:               http://localhost:3001/cases"
  Write-Host "Hotspots:            http://localhost:3001/hotspots"
  Write-Host "Copilot:             http://localhost:3001/copilot"
  Write-Host "Risk:                http://localhost:3001/risk"
}

function Health-Check {
  $targets = @(
    @{ Name = "Pandora web"; Url = "http://localhost:3001/api/health" },
    @{ Name = "Pandora AI"; Url = "http://localhost:7701/health" },
    @{ Name = "Digest"; Url = "http://localhost:7702/health" },
    @{ Name = "Alerts"; Url = "http://localhost:7703/health" },
    @{ Name = "Ontology"; Url = "http://localhost:7704/health" },
    @{ Name = "Cases"; Url = "http://localhost:7705/health" },
    @{ Name = "Hotspots"; Url = "http://localhost:7706/health" },
    @{ Name = "Copilot"; Url = "http://localhost:7707/health" },
    @{ Name = "Risk"; Url = "http://localhost:7708/health" },
    @{ Name = "Metrics"; Url = "http://localhost:7710/health" },
    @{ Name = "Grafana"; Url = "http://localhost:3002/api/health" },
    @{ Name = "Prometheus"; Url = "http://localhost:9090/-/ready" }
  )

  foreach ($target in $targets) {
    Write-Host "`n$($target.Name):" -ForegroundColor Cyan
    try {
      Invoke-WebRequest -Uri $target.Url -UseBasicParsing -TimeoutSec 8 | Select-Object -ExpandProperty Content
    } catch {
      Write-Host "DOWN or unavailable: $($_.Exception.Message)" -ForegroundColor Yellow
    }
  }
}

$serviceMap = @{
  pandora  = @("pandora")
  ai       = @("pandora-ai")
  digest   = @("pandora-digest")
  alerts   = @("pandora-alerts")
  ontology = @("pandora-ontology")
  cases    = @("pandora-cases")
  hotspots = @("pandora-hotspots")
  copilot  = @("pandora-copilot")
  risk     = @("pandora-risk")
  metrics  = @("pandora-metrics")
}

switch ($Command.ToLowerInvariant()) {
  "help" { Show-Help }
  "up" { Compose up -d }
  "down" { Compose down }
  "restart" { Compose up -d --build }
  "restart-fast" { Compose restart }
  "clean" { Compose down --remove-orphans }
  "pull" { Compose pull }
  "ps" { Compose ps }
  "logs" { Compose logs -f --tail=200 }
  "build" { npm run build }
  "lint" { npm run lint }
  "urls" { Show-Urls }
  "grafana-open" { Show-Urls }
  "prometheus-open" { Show-Urls }
  "health" { Health-Check }
  "grafana" { Compose up -d grafana prometheus blackbox-exporter cadvisor pandora-metrics }
  "obs" { Compose up -d grafana prometheus blackbox-exporter cadvisor pandora-metrics }
  "logs-pandora" { Compose logs -f --tail=200 pandora }
  "logs-grafana" { Compose logs -f --tail=200 grafana prometheus pandora-metrics }
  "logs-metrics" { Compose logs -f --tail=200 pandora-metrics }
  default {
    if ($serviceMap.ContainsKey($Command.ToLowerInvariant())) {
      Compose up -d --build @($serviceMap[$Command.ToLowerInvariant()])
    } else {
      Write-Host "Unknown command: $Command" -ForegroundColor Red
      Show-Help
      exit 1
    }
  }
}