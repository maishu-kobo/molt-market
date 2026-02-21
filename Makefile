.PHONY: start stop restart logs status clean setup before-commit

# Start all services (infra + API + worker + frontend)
start:
	docker compose up -d --build

# Stop all services
stop:
	docker compose down

# Restart all services
restart: stop start

# Tail logs for all services
logs:
	docker compose logs -f

# Show running services
status:
	docker compose ps

# Stop and remove volumes (full reset)
clean:
	docker compose down -v

# Run before committing — mirrors CI checks locally
before-commit:
	npm run typecheck
	npm run test:unit
	npm run build

# Install dependencies locally (for IDE support)
setup:
	cd backend && npm install
	cd frontend && npm install
