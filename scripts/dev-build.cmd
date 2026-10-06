@echo off
set "GOCACHE=%CD%\tmp\go-build-cache"

esbuild index.js --bundle --minify --format=esm --outfile=assets/bundle.js --sourcemap --loader:.js=jsx --jsx-factory=h --jsx-fragment=Fragment
if errorlevel 1 exit /b %errorlevel%

go build --tags fts5 -o .\tmp\main.exe .
