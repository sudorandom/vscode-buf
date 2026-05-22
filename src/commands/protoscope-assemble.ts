import * as vscode from "vscode";
import { Command } from "./command";

/**
 * bufProtoscopeAssemble assembles a protoscope text file into a Protocol Buffers binary file
 * using the Buf language server's workspace command.
 */
export const bufProtoscopeAssemble = new Command(
  "buf.protoscope.assemble",
  "COMMAND_TYPE_SERVER",
  async (_, ...args) => {
    let fileUri = args[0] as vscode.Uri | undefined;
    if (!fileUri) {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const uri = activeEditor.document.uri;
        const isProtoscope =
          activeEditor.document.languageId === "protoscope" ||
          uri.path.toLowerCase().endsWith(".protoscope");
        if (isProtoscope) {
          fileUri = uri;
        }
      }
    }
    if (!fileUri) {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: "Assemble",
        filters: {
          "Protoscope Files": ["protoscope"],
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
      const assembledBase64 = await vscode.commands.executeCommand<string>(
        "buf.protoscope.assemble.server",
        fileUri.toString()
      );
      if (!assembledBase64) {
        vscode.window.showErrorMessage(
          "Failed to assemble: empty response from server"
        );
        return;
      }

      // Prompt the user to save the binary file
      const defaultUri = fileUri.with({
        path: fileUri.path.endsWith(".protoscope")
          ? fileUri.path.replace(/\.protoscope$/, ".bin")
          : fileUri.path + ".bin",
      });

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: defaultUri,
        saveLabel: "Assemble",
        filters: {
          "Protobuf Binaries": ["bin", "pb", "binpb", "wire"],
          "All files": ["*"],
        },
      });

      if (saveUri) {
        const binaryData = Buffer.from(assembledBase64, "base64");
        await vscode.workspace.fs.writeFile(saveUri, binaryData);
        vscode.window.showInformationMessage(
          `Successfully assembled to ${vscode.workspace.asRelativePath(saveUri)}`
        );
      }
    } catch (e) {
      vscode.window.showErrorMessage(`Assembly failed: ${e}`);
    }
  }
);
