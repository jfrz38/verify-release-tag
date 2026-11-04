PNPM ?= pnpm

FORMAT_PATHS := .github src tests README.md package.json pnpm-workspace.yaml tsconfig.json vitest.config.mts eslint.config.mjs .prettierrc.json

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show available targets
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {sub("\\\\n",sprintf("\n%22c"," "), $$2);printf " \033[36m%-20s\033[0m  %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: install
install: ## Install dependencies from the frozen lockfile
	$(PNPM) install --frozen-lockfile

.PHONY: build bundle-check
build: ## Build the bundled GitHub Action
	$(PNPM) exec esbuild src/main.ts --bundle --platform=node --target=node24 --format=cjs --outfile=dist/index.js

bundle-check: build ## Verify that the committed bundle is current
	git diff --exit-code -- dist/index.js

.PHONY: format format-check lint typecheck
format: ## Format project files
	$(PNPM) exec prettier --write $(FORMAT_PATHS)

format-check: ## Check project formatting
	$(PNPM) exec prettier --check $(FORMAT_PATHS)

lint: ## Lint the project
	$(PNPM) exec eslint .

typecheck: ## Type-check without emitting files
	$(PNPM) exec tsc --noEmit

.PHONY: test
test: ## Run the complete test suite
	$(PNPM) exec vitest run --passWithNoTests

.PHONY: validate ci
validate: ## Run all validation gates
	$(MAKE) format-check
	$(MAKE) lint
	$(MAKE) typecheck
	$(MAKE) test
	$(MAKE) bundle-check

ci: ## Install dependencies and run all validation gates
	$(MAKE) install
	$(MAKE) validate
