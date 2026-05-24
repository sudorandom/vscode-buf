import * as vscode from "vscode";
import { Command } from "./command";
import { log } from "../log";

/**
 * bufProtoscopeDisassemble disassembles a binary protobuf file into protoscope text format
 * using the Buf language server's workspace command.
 */
export const bufProtoscopeDisassemble = new Command(
  "buf.protoscope.disassemble",
  "COMMAND_TYPE_SERVER",
  async (_, ...args) => {
    let fileUri = args[0] as vscode.Uri | undefined;
    log.info(`[protoscope-disassemble] Command invoked. args[0]: ${fileUri?.toString()}`);

    if (!fileUri) {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const uri = activeEditor.document.uri;
        const ext = uri.path.split(".").pop()?.toLowerCase();
        log.info(`[protoscope-disassemble] No fileUri in args. Active editor: ${uri.toString()}, extension: ${ext}`);
        if (ext && ["bin", "pb", "binpb", "wire"].includes(ext)) {
          fileUri = uri;
        }
      }
    }
    if (!fileUri) {
      log.info("[protoscope-disassemble] No fileUri resolved. Prompting Open Dialog.");
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: "Disassemble",
        filters: {
          "Protobuf Binaries": ["bin", "pb", "binpb", "wire"],
          "All files": ["*"],
        },
      });
      if (uris && uris.length > 0) {
        fileUri = uris[0];
        log.info(`[protoscope-disassemble] Resolved fileUri from Open Dialog: ${fileUri.toString()}`);
      }
    }
    if (!fileUri) {
      log.info("[protoscope-disassemble] Cancelled or no file selected. Exiting.");
      return;
    }

    try {
      // Check file extensions to avoid prompting
      let variant: string | undefined = undefined;
      const pathLower = fileUri.path.toLowerCase();
      if (pathLower.endsWith(".connect.bin")) {
        variant = "connectrpc";
      } else if (pathLower.endsWith(".grpc.bin")) {
        variant = "grpc";
      } else if (pathLower.endsWith(".varint.bin")) {
        variant = "varint";
      } else if (pathLower.endsWith(".binpb")) {
        variant = "raw";
      }

      if (variant === undefined) {
        // Prompt user for framing format (variant)
        log.info("[protoscope-disassemble] Prompting user for framing variant.");
        const chosen = await vscode.window.showQuickPick(
          ["Raw protobuf", "gRPC message framing", "ConnectRPC message framing", "VARINT delimited"],
          {
            placeHolder: "Select the binary's message framing format:",
            ignoreFocusOut: true,
          }
        );
        if (!chosen) {
          log.info("[protoscope-disassemble] Variant selection cancelled by user.");
          return; // User cancelled
        }
        if (chosen === "gRPC message framing") {
          variant = "grpc";
        } else if (chosen === "ConnectRPC message framing") {
          variant = "connectrpc";
        } else if (chosen === "VARINT delimited") {
          variant = "varint";
        } else {
          variant = "raw";
        }
        log.info(`[protoscope-disassemble] User selected variant: '${variant}' (from choice: '${chosen}')`);
      } else {
        log.info(`[protoscope-disassemble] Dedicated extension matched. Auto-selecting variant: '${variant}' for path: '${fileUri.path}'`);
      }

      // Execute the custom command on the Buf LSP server
      log.info(`[protoscope-disassemble] Invoking server command 'buf.protoscope.disassemble.server' with args: uri='${fileUri.toString()}', variant='${variant}'`);
      const disassembledText = await vscode.commands.executeCommand<string>(
        "buf.protoscope.disassemble.server",
        fileUri.toString(),
        variant
      );
      log.info(`[protoscope-disassemble] Server response received. Length: ${disassembledText ? disassembledText.length : "empty/null"}`);
      if (!disassembledText) {
        log.error("[protoscope-disassemble] Failed to disassemble: empty response from server");
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
