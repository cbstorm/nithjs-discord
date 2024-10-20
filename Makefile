
.PHONY: test
all: build
build:
	rm -rf .out
	npm run build
deps:
	npm install
link:
	npm link
publish:
	npm run build
	npm publish --access public
clean: 
	rm -rf node_modules
	rm -rf .out
test:
	npm run test