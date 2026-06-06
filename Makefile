# Makefile for slack-bot
# Run `make help` to see available targets.

# Name of the systemd service (used by the server-side targets)
SERVICE := slackbot.service

.PHONY: help install run start dev env deploy logs status restart stop enable disable

help: ## Show this help
	@echo "slack-bot - available make targets:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

## --- Local development ---

install: ## Install npm dependencies
	npm install

run: ## Run the bot locally (node index.js)
	node index.js

start: run ## Alias for `run`

dev: install run ## Install deps then run locally

env: ## Create a .env from .env.example if it doesn't exist
	@if [ -f .env ]; then \
		echo ".env already exists, leaving it untouched."; \
	else \
		cp .env.example .env && echo "Created .env from .env.example - edit it with your real tokens."; \
	fi

## --- Server / systemd (run on the server, usually as root) ---

deploy: ## Pull latest code, install deps, and restart the service
	git pull
	npm install
	sudo systemctl restart $(SERVICE)

logs: ## Follow the systemd service logs
	journalctl -u $(SERVICE) -f

status: ## Show the systemd service status
	systemctl status $(SERVICE)

restart: ## Restart the systemd service
	sudo systemctl restart $(SERVICE)

stop: ## Stop the systemd service
	sudo systemctl stop $(SERVICE)

enable: ## Enable + start the service on boot
	sudo systemctl enable --now $(SERVICE)

disable: ## Disable the service from starting on boot
	sudo systemctl disable $(SERVICE)
