import * as vscode from "vscode";
import { log } from "../log";
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
    log.info(
      `[protoscope-assemble] Command invoked. args[0]: ${fileUri?.toString()}`
    );

    if (!fileUri) {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const uri = activeEditor.document.uri;
        const isProtoscope =
          activeEditor.document.languageId === "protoscope" ||
          uri.path.toLowerCase().endsWith(".protoscope");
        log.info(
          `[protoscope-assemble] No fileUri in args. Active editor: ${uri.toString()}, isProtoscope: ${isProtoscope}`
        );
        if (isProtoscope) {
          fileUri = uri;
        }
      }
    }
    if (!fileUri) {
      log.info(
        "[protoscope-assemble] No fileUri resolved from arguments or active editor. Prompting Open Dialog."
      );
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
        log.info(
          `[protoscope-assemble] Resolved fileUri from Open Dialog: ${fileUri.toString()}`
        );
      }
    }
    if (!fileUri) {
      log.info("[protoscope-assemble] Cancelled or no file selected. Exiting.");
      return;
    }

    try {
      // Determine the text to compile and check if there are multiple frames
      let textToAssemble = "";
      let selectedText: string | undefined;
      const activeEditor = vscode.window.activeTextEditor;

      log.info(
        `[protoscope-assemble] Active editor check. activeEditor uri: ${activeEditor?.document?.uri?.toString()}, fileUri: ${fileUri.toString()}`
      );
      if (activeEditor) {
        log.info(
          `[protoscope-assemble] fsPath comparison: activeEditor.document.uri.fsPath = '${activeEditor.document.uri.fsPath}', fileUri.fsPath = '${fileUri.fsPath}', matches: ${activeEditor.document.uri.fsPath === fileUri.fsPath}`
        );
      }

      if (activeEditor && activeEditor.document.uri.fsPath === fileUri.fsPath) {
        const selection = activeEditor.selection;
        log.info(
          `[protoscope-assemble] Editor selection range: start=[${selection.start.line}:${selection.start.character}], end=[${selection.end.line}:${selection.end.character}], isEmpty: ${selection.isEmpty}`
        );
        if (selection && !selection.isEmpty) {
          selectedText = activeEditor.document.getText(selection);
          log.info(
            `[protoscope-assemble] Text selection detected. Character length: ${selectedText.length}`
          );
          textToAssemble = selectedText;
        } else {
          log.info(
            "[protoscope-assemble] Selection is empty. Reading entire document."
          );
          textToAssemble = activeEditor.document.getText();
        }
      } else {
        log.info(
          "[protoscope-assemble] Active editor does not match target file or is not open. Reading file from disk."
        );
        try {
          const fileBytes = await vscode.workspace.fs.readFile(fileUri);
          textToAssemble = new TextDecoder().decode(fileBytes);
        } catch (e) {
          log.error(`[protoscope-assemble] Error reading file: ${e}`);
        }
      }

      // Determine if multiple frames are present
      const hasMultipleFrames = textToAssemble.includes("---");
      const options = hasMultipleFrames
        ? [
            "gRPC message framing",
            "ConnectRPC message framing",
            "VARINT delimited",
          ]
        : [
            "None (no framing)",
            "gRPC message framing",
            "ConnectRPC message framing",
            "VARINT delimited",
          ];

      const chosen = await vscode.window.showQuickPick(options, {
        placeHolder: hasMultipleFrames
          ? "This file/selection contains multiple frames. Select the assembly framing format:"
          : "Select the assembly framing format:",
        ignoreFocusOut: true,
      });
      if (!chosen) {
        return; // User cancelled
      }

      let framing = "none";
      if (chosen === "gRPC message framing") {
        framing = "grpc";
      } else if (chosen === "ConnectRPC message framing") {
        framing = "connectrpc";
      } else if (chosen === "VARINT delimited") {
        framing = "varint";
      }

      // Execute the custom command on the Buf LSP server
      const debugMsg = `[Debug] Assembling: selectionLength=${selectedText !== undefined ? selectedText.length : "none"}, framing=${framing}`;
      log.info(`[protoscope-assemble] ${debugMsg}`);
      vscode.window.showInformationMessage(debugMsg);

      log.info(
        `[protoscope-assemble] Invoking server command 'buf.protoscope.assemble.server' with args: uri='${fileUri.toString()}', selectedTextLength=${selectedText !== undefined ? selectedText.length : "undefined"}, framing='${framing}'`
      );
      const assembledBase64 = await vscode.commands.executeCommand<string>(
        "buf.protoscope.assemble.server",
        fileUri.toString(),
        selectedText ?? null,
        framing
      );
      log.info(
        `[protoscope-assemble] Server response received. Length: ${assembledBase64 ? assembledBase64.length : "empty/null"}`
      );
      if (!assembledBase64) {
        log.error(
          "[protoscope-assemble] Failed to assemble: empty response from server"
        );
        vscode.window.showErrorMessage(
          "Failed to assemble: empty response from server"
        );
        return;
      }

      // Prompt the user to save the binary file using dedicated extensions
      let targetExt = ".binpb";
      if (framing === "grpc") {
        targetExt = ".grpc.bin";
      } else if (framing === "connectrpc") {
        targetExt = ".connect.bin";
      } else if (framing === "varint") {
        targetExt = ".varint.bin";
      }

      const defaultUri = fileUri.with({
        path: fileUri.path.endsWith(".protoscope")
          ? fileUri.path.replace(/\.protoscope$/, targetExt)
          : fileUri.path + targetExt,
      });

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: defaultUri,
        saveLabel: "Assemble",
        filters: {
          "Protobuf Binaries": [
            "binpb",
            "grpc.bin",
            "connect.bin",
            "varint.bin",
            "bin",
            "pb",
            "wire",
          ],
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
