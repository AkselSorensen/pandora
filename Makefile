SHELL := /bin/sh

COMPOSE := docker compose

.DEFAULT_GOAL := help

.PHONY: help up down restart restart-fast clean ps logs pull build lint urls health \
        pandora grafana obs metrics ai digest alerts ontology cases hotspots copilot risk nuclear cyberdef aerospace dgsi \
        logs-pandora logs-grafana logs-metrics grafana-open prometheus-open

help: ## Show available commands
	@echo "Pandora Make commands"
	@echo ""
	@echo "Global:"
	@echo "  make up              Start the full stack"
	@echo "  make down            Stop and remove the stack"
	@echo "  make restart         Rebuild/restart the full stack"
	@echo "  make restart-fast    Restart containers without rebuild"
	@echo "  make clean           Down + remove orphans"
	@echo "  make ps              Show containers"
	@echo "  make logs            Follow all logs"
	@echo ""
	@echo "Per service:"
	@echo "  make pandora         Rebuild/restart web app only"
	@echo "  make grafana         Restart Grafana + Prometheus + exporters"
	@echo "  make obs             Restart observability stack"
	@echo "  make metrics         Rebuild/restart pandora-metrics"
	@echo "  make ai              Rebuild/restart pandora-ai"
	@echo "  make digest          Rebuild/restart pandora-digest"
	@echo "  make alerts          Rebuild/restart pandora-alerts"
	@echo "  make ontology        Rebuild/restart pandora-ontology"
	@echo "  make cases           Rebuild/restart pandora-cases"
	@echo "  make hotspots        Rebuild/restart pandora-hotspots"
	@echo "  make copilot         Rebuild/restart pandora-copilot"
	@echo "  make risk            Rebuild/restart pandora-risk"
	@echo "  make nuclear         Rebuild/restart pandora-nuclear"
	@echo "  make cyberdef        Rebuild/restart pandora-cyberdef"
	@echo "  make aerospace       Rebuild/restart pandora-aerospace"
	@echo "  make dgsi            Rebuild/restart pandora-dgsi"
	@echo ""
	@echo "Tools:"
	@echo "  make build           Run Next build"
	@echo "  make lint            Run eslint"
	@echo "  make urls            Print useful URLs"
	@echo "  make health          Quick health checks"

up: ## Start the full stack
	$(COMPOSE) up -d

down: ## Stop and remove the stack
	$(COMPOSE) down

restart: ## Rebuild and restart the full stack
	$(COMPOSE) up -d --build

restart-fast: ## Restart containers without rebuilding
	$(COMPOSE) restart

clean: ## Stop stack and remove orphan containers
	$(COMPOSE) down --remove-orphans

pull: ## Pull registry images where applicable
	$(COMPOSE) pull

ps: ## Show compose containers
	$(COMPOSE) ps

logs: ## Follow all logs
	$(COMPOSE) logs -f --tail=200

build: ## Run Next production build locally
	npm run build

lint: ## Run eslint locally
	npm run lint

pandora: ## Rebuild/restart only the web app
	$(COMPOSE) up -d --build pandora

ai: ## Rebuild/restart Pandora AI service
	$(COMPOSE) up -d --build pandora-ai

digest: ## Rebuild/restart digest service
	$(COMPOSE) up -d --build pandora-digest

alerts: ## Rebuild/restart alerts service
	$(COMPOSE) up -d --build pandora-alerts

ontology: ## Rebuild/restart ontology service
	$(COMPOSE) up -d --build pandora-ontology

cases: ## Rebuild/restart cases service
	$(COMPOSE) up -d --build pandora-cases

hotspots: ## Rebuild/restart hotspots service
	$(COMPOSE) up -d --build pandora-hotspots

copilot: ## Rebuild/restart copilot service
	$(COMPOSE) up -d --build pandora-copilot

risk: ## Rebuild/restart risk service
	$(COMPOSE) up -d --build pandora-risk

nuclear: ## Rebuild/restart nuclear deterrence simulator
	$(COMPOSE) up -d --build pandora-nuclear

cyberdef: ## Rebuild/restart cyber defense service
	$(COMPOSE) up -d --build pandora-cyberdef

aerospace: ## Rebuild/restart aerospace surveillance service
	$(COMPOSE) up -d --build pandora-aerospace

dgsi: ## Rebuild/restart territorial intelligence service
	$(COMPOSE) up -d --build pandora-dgsi

metrics: ## Rebuild/restart Pandora Prometheus exporter
	$(COMPOSE) up -d --build pandora-metrics

grafana: ## Restart Grafana stack only
	$(COMPOSE) up -d grafana prometheus blackbox-exporter cadvisor pandora-metrics

obs: grafana ## Alias for observability stack

logs-pandora: ## Follow web app logs
	$(COMPOSE) logs -f --tail=200 pandora

logs-grafana: ## Follow Grafana/Prometheus logs
	$(COMPOSE) logs -f --tail=200 grafana prometheus pandora-metrics

logs-metrics: ## Follow Pandora metrics exporter logs
	$(COMPOSE) logs -f --tail=200 pandora-metrics

urls: ## Print useful local URLs
	@echo "Pandora UI:          http://localhost:3001"
	@echo "Grafana:             http://localhost:3002  (admin / pandora)"
	@echo "Prometheus:          http://localhost:9090"
	@echo "cAdvisor:            http://localhost:8080"
	@echo "Blackbox exporter:   http://localhost:9115"
	@echo "Pandora Metrics:     http://localhost:7710/metrics"
	@echo "Digest:              http://localhost:3001/digest"
	@echo "Alerts:              http://localhost:3001/alerts"
	@echo "Ontology:            http://localhost:3001/ontology"
	@echo "Cases:               http://localhost:3001/cases"
	@echo "Hotspots:            http://localhost:3001/hotspots"
	@echo "Copilot:             http://localhost:3001/copilot"
	@echo "Risk:                http://localhost:3001/risk"
	@echo "CyberDef:            http://localhost:7711/health"

grafana-open: urls ## Print Grafana URL

prometheus-open: urls ## Print Prometheus URL

health: ## Quick health checks for key services
	@echo "Pandora web:" && curl -fsS http://localhost:3001/api/health || true
	@echo "\nPandora AI:" && curl -fsS http://localhost:7701/health || true
	@echo "\nDigest:" && curl -fsS http://localhost:7702/health || true
	@echo "\nAlerts:" && curl -fsS http://localhost:7703/health || true
	@echo "\nOntology:" && curl -fsS http://localhost:7704/health || true
	@echo "\nCases:" && curl -fsS http://localhost:7705/health || true
	@echo "\nHotspots:" && curl -fsS http://localhost:7706/health || true
	@echo "\nCopilot:" && curl -fsS http://localhost:7707/health || true
	@echo "\nRisk:" && curl -fsS http://localhost:7708/health || true
	@echo "\nCyberDef:" && curl -fsS http://localhost:7711/health || true
	@echo "\nMetrics:" && curl -fsS http://localhost:7710/health || true
	@echo "\nGrafana:" && curl -fsS http://localhost:3002/api/health || true
	@echo "\nPrometheus:" && curl -fsS http://localhost:9090/-/ready || true