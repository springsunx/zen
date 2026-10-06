.PHONY: build dev watch test

build:
	esbuild index.js --bundle --minify --format=esm --outfile=assets/bundle.js --loader:.js=jsx --jsx-factory=h --jsx-fragment=Fragment
	go build --tags "fts5"

dev:
ifeq ($(OS),Windows_NT)
	set "DEV_MODE=true" && "$(shell go env GOPATH)/bin/air.exe" -c .air.toml
else
	DEV_MODE=true air -c .air.toml
endif

watch: dev

test:
	go test --tags "fts5" ./...
	node --test 'commons/**/*.test.js' 'features/**/*.test.js'
