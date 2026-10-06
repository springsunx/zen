.PHONY: build dev watch test

build:
	esbuild index.js --bundle --minify --format=esm --outfile=assets/bundle.js --loader:.js=jsx --jsx-factory=h --jsx-fragment=Fragment
	go build --tags "fts5"

dev:
	esbuild index.js --bundle --minify --format=esm --outfile=assets/bundle.js --sourcemap --loader:.js=jsx --jsx-factory=h --jsx-fragment=Fragment
ifeq ($(OS),Windows_NT)
	set "DEV_MODE=true" && go run --tags "fts5" main.go
else
	DEV_MODE=true go run --tags "fts5" main.go
endif

watch:
	DEV_MODE=true air --build.cmd 'go build --tags "fts5" -o ./tmp/main .' & esbuild index.js --bundle --outfile=assets/bundle.js --loader:.js=jsx --jsx-factory=h --jsx-fragment=Fragment --watch

test:
	go test --tags "fts5" ./...
	node --test 'commons/**/*.test.js' 'features/**/*.test.js'
