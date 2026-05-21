import * as vscode from "vscode";
import { Command } from "./command";

/**
 * bufProtoscopeDisassemble disassembles a binary protobuf file into protoscope text format
 * using the Buf language server's workspace command.
 */
export const bufProtoscopeDisassemble = new Command(
  "buf.protoscope.disassemble",
  "COMMAND_TYPE_SERVER",
  async (_, ...args) => {
    let fileUri = args[0] as vscode.Uri | undefined;
    if (!fileUri) {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: "Disassemble",
        filters: {
          "Protobuf Binaries": ["binpb", "bin", "pb", "wire"],
          "All files": ["*"],
        },
      });
      if (uris && uris.length > 0) {
        fileUri = uris[0];
      }
    }
    if (!fileUri) {
      return;
    }

    try {
      // Execute the custom command on the Buf LSP server
      const disassembledText = await vscode.commands.executeCommand<string>(
        "buf.protoscope.disassemble.server",
        fileUri.toString()
      );
      if (!disassembledText) {
        vscode.window.showErrorMessage(
          "Failed to disassemble: empty response from server"
        );
        return;
      }

      // Open in a new editor pane as a protoscope file
      const doc = await vscode.workspace.openTextDocument({
        language: "protoscope",
        content: disassembledText,
      });
      await vscode.window.showTextDocument(doc);
    } catch (e) {
      vscode.window.showErrorMessage(`Disassembly failed: ${e}`);
    }
  }
);
