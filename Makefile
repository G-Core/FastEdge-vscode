VSIX = fastedge-0.1.0.vsix

ifeq ($(OS),Windows_NT)     # is the operating system Windows?
    COPY = cp rust-cli/cli.exe distr/
else
    UNAME_S := $(shell uname -s)
    ifeq ($(UNAME_S),Linux)   # is the operating system Linux?
        COPY = cp rust-cli/cli-linux-x64 distr/cli
    endif
    ifeq ($(UNAME_S),Darwin)  # is the operating system MacOS?
        COPY = cp rust-cli/cli-darwin-arm64 distr/cli
    endif
endif

.PHONY: all clean install uninstall reinstall distr/runner copycli

all: $(VSIX)

distr/runner:
	cd cmd && go build
	mv cmd/cmd distr/runner

copycli:
	$(COPY)

$(VSIX): distr/package.json distr/runner copycli
	cd distr && npx @vscode/vsce package

install:
	code --install-extension distr/$(VSIX)

uninstall:
	code --uninstall-extension Gcore.fastedge

reinstall: uninstall clean $(VSIX) install

clean:
	rm -f $(VSIX)
