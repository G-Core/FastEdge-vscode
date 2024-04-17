const vscode = require('vscode');
const cp = require('child_process');

// TODO: Add JavaScript source support
function compileAndFindBinaries() {
    return new Promise((resolve, reject) => {
        const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const cargoBuild = cp.spawn('cargo', ['build', '--message-format=json'], { cwd: workspaceFolder });

        let stdout = '';
        let stderr = '';

        cargoBuild.stdout.on('data', (data) => {
            stdout += data;
        });

        cargoBuild.stderr.on('data', (data) => {
            stderr += data;
        });

        cargoBuild.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`cargo build exited with code ${code}: ${stderr}`));
                return;
            }

            const lines = stdout.split('\n');
            const binary = [];

            for (const line of lines) {
                if (!line) continue;

                let message;
                try {
                    message = JSON.parse(line);
                } catch (err) {
                    reject(new Error(`Failed to parse cargo output: ${err.message}`));
                    return;
                }

                // if (message.filenames.length > 0) {
                if (message.reason === 'compiler-artifact' && message.filenames && message.filenames.length == 1) {
                    if (/.*\.wasm$/.test(message.filenames[0])) {
                        binary.push(message.filenames[0]);
                        break;
                    }
                }
            }

            resolve(binary);
        });
    });
}

class MyDebugAdapterDescriptorFactory {
    createDebugAdapterDescriptor(session, executable) {
        return new vscode.DebugAdapterExecutable(executable.command);
    }
}

class BinaryDebugConfigurationProvider {
    async resolveDebugConfiguration(folder, config, token) {
        try {
            const binary = await compileAndFindBinaries();
            config.binary = binary[0];
        return config;
        } catch (err) {
            console.error(err);
            return config;
        }
    }
}


function activate(context) {
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('fastedge', new MyDebugAdapterDescriptorFactory()));
}

exports.activate = activate;
vscode.debug.registerDebugConfigurationProvider('fastedge', new BinaryDebugConfigurationProvider());
