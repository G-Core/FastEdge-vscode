const vscode = require('vscode');

class MyDebugAdapterDescriptorFactory {
    createDebugAdapterDescriptor(session, executable) {
        return new vscode.DebugAdapterExecutable(executable.command);
    }
}

function activate(context) {
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('fastedge', new MyDebugAdapterDescriptorFactory()));
}

exports.activate = activate;
