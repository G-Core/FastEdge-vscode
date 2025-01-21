import * as vscode from "vscode";
import { FastEdgeDebugSession } from "./FastEdgeDebugSession";

export class FastEdgeDebugAdapterDescriptorFactory
  implements vscode.DebugAdapterDescriptorFactory
{
  createDebugAdapterDescriptor(
    session: vscode.DebugSession,
    executable: vscode.DebugAdapterExecutable | undefined
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(
      new FastEdgeDebugSession()
    ) as vscode.DebugAdapterDescriptor;
  }
}
