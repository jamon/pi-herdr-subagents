import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  closeHerdrSurface,
  createHerdrSurface,
  createHerdrSurfaceSplit,
  isHerdrAvailable,
  readHerdrScreen,
  readHerdrScreenAsync,
  inspectHerdrPane,
  renameHerdrTab,
  renameHerdrWorkspace,
  reportHerdrPaneTask,
  sendHerdrCommand,
  sendHerdrEscape,
} from "./herdr.ts";

export type PaneId = string;
export type SplitDirection = "right" | "down";

const SETUP_HINT = "Start pi inside herdr (`herdr`, then run `pi`).";

export function isTerminalAvailable(): boolean {
  return isHerdrAvailable();
}

export function terminalSetupHint(): string {
  return SETUP_HINT;
}

function assertTerminalAvailable(): void {
  if (!isTerminalAvailable()) throw new Error(`herdr is not available. ${SETUP_HINT}`);
}

export function isWindowsShell(): boolean {
  return process.platform === "win32";
}

export function scriptExtension(): ".ps1" | ".sh" {
  return isWindowsShell() ? ".ps1" : ".sh";
}

export function shellQuote(value: string): string {
  return isWindowsShell()
    ? "'" + value.replace(/'/g, "''") + "'"
    : "'" + value.replace(/'/g, "'\\''") + "'";
}

export function shellEnv(name: string, value: string): string {
  return isWindowsShell() ? `$env:${name} = ${shellQuote(value)}` : `${name}=${shellQuote(value)}`;
}

export function shellCd(cwd?: string): string {
  if (!cwd) return "";
  return isWindowsShell() ? `Set-Location -LiteralPath ${shellQuote(cwd)}; ` : `cd ${shellQuote(cwd)} && `;
}

export function shellEnvPrefix(assignments: string[]): string {
  if (assignments.length === 0) return "";
  return isWindowsShell() ? `${assignments.join("; ")}; ` : `${assignments.join(" ")} `;
}

export function shellDoneTrailer(): string {
  return isWindowsShell()
    ? `; if ($null -eq $LASTEXITCODE) { $code = if ($?) { 0 } else { 1 } } else { $code = $LASTEXITCODE }; Write-Output "__SUBAGENT_DONE_$($code)__"`
    : "; echo '__SUBAGENT_DONE_'$?'__'";
}

/** Create a new herdr tab and return its root pane ID. */
export function createSubagentPane(name: string): PaneId {
  assertTerminalAvailable();
  return createHerdrSurface(name);
}

/** Split the current herdr pane and return the child pane ID. */
export function splitCurrentPane(name: string, direction: SplitDirection): PaneId {
  assertTerminalAvailable();
  return createHerdrSurfaceSplit(name, direction);
}

export function renameCurrentTab(title: string): void {
  assertTerminalAvailable();
  renameHerdrTab(title);
}

export function renameCurrentWorkspace(title: string): void {
  assertTerminalAvailable();
  renameHerdrWorkspace(title);
}

export function runInPane(paneId: PaneId, command: string): void {
  assertTerminalAvailable();
  sendHerdrCommand(paneId, command);
}

export function interruptPane(paneId: PaneId): void {
  assertTerminalAvailable();
  sendHerdrEscape(paneId);
}

export function runScriptInPane(
  paneId: PaneId,
  command: string,
  options?: { scriptPath?: string; scriptPreamble?: string },
): string {
  const scriptPath =
    options?.scriptPath ??
    join(
      tmpdir(),
      "pi-herdr-subagent-scripts",
      `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}${scriptExtension()}`,
    );
  mkdirSync(dirname(scriptPath), { recursive: true });

  const scriptLines = isWindowsShell() ? [] : ["#!/bin/bash"];
  if (options?.scriptPreamble) scriptLines.push(options.scriptPreamble.trimEnd());
  scriptLines.push(command);
  writeFileSync(scriptPath, `${scriptLines.join("\n")}\n`, { mode: 0o755 });

  runInPane(paneId, isWindowsShell()
    ? `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${shellQuote(scriptPath)}`
    : `bash ${shellQuote(scriptPath)}`);
  return scriptPath;
}

export function readPane(paneId: PaneId, lines = 50): string {
  assertTerminalAvailable();
  return readHerdrScreen(paneId, lines);
}

export async function readPaneAsync(paneId: PaneId, lines = 50): Promise<string> {
  assertTerminalAvailable();
  return readHerdrScreenAsync(paneId, lines);
}

export type { PaneInspection, HerdrAgentStatus } from "./lifecycle.ts";

export async function inspectPane(paneId: PaneId): Promise<import("./lifecycle.ts").PaneInspection> {
  assertTerminalAvailable();
  const result = await inspectHerdrPane(paneId);
  if (result.kind === "present") {
    return { kind: "present", observedAt: Date.now(), ...result };
  }
  return result;
}

export function closePane(paneId: PaneId): void {
  assertTerminalAvailable();
  closeHerdrSurface(paneId);
}

export function setPaneTask(paneId: PaneId, task: string): void {
  if (!isTerminalAvailable()) return;
  reportHerdrPaneTask(paneId, task);
}
