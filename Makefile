VSIX = fastedge-0.1.0.vsix

.PHONY: all clean install uninstall reinstall distr/runner

all: $(VSIX)

distr/runner:
	cd cmd && go build
	mv cmd/cmd distr/runner

$(VSIX): distr/package.json distr/runner
	cd distr && npx @vscode/vsce package --allow-missing-repository

install:
	code --install-extension distr/$(VSIX)

uninstall:
	code --uninstall-extension Gcore.fastedge

reinstall: uninstall clean $(VSIX) install

clean:
	rm -f $(VSIX)
