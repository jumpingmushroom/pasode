import type { ToolCallDetail } from "@getpaseo/protocol/agent-types"
import { createPatch } from "diff"
import path from "node:path"

// Filetype aliases and output collapsing adapted from OpenCode; see OPENCODE-LICENSE.
const languages: Record<string, string> = {
  js: "typescript", jsx: "typescript", mjs: "typescript", cjs: "typescript",
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  json: "json", jsonc: "json", md: "markdown", markdown: "markdown",
  py: "python", rs: "rust", go: "go", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp",
  css: "css", scss: "scss", html: "html", htm: "html", xml: "xml",
  sh: "bash", bash: "bash", zsh: "bash", ksh: "bash", yaml: "yaml", yml: "yaml", toml: "toml",
  rb: "ruby", rake: "ruby", php: "php", java: "java", kt: "kotlin", kts: "kotlin",
  swift: "swift", cs: "csharp", lua: "lua", sql: "sql", ex: "elixir", exs: "elixir",
  zig: "zig", zon: "zig", vue: "vue", svelte: "svelte", astro: "astro", dart: "dart",
  ml: "ocaml", mli: "ocaml", nix: "nix", tf: "terraform", hcl: "hcl", diff: "diff", patch: "diff",
}

export function filetype(filename: string) {
  const basename = path.basename(filename).toLowerCase()
  if (basename === "dockerfile" || basename.startsWith("dockerfile.")) return "dockerfile"
  if (basename === "makefile" || basename === "gnumakefile") return "makefile"
  return languages[path.extname(basename).slice(1)] ?? "none"
}

export function editDiff(detail: Extract<ToolCallDetail, { type: "edit" }>) {
  if (detail.unifiedDiff?.trim()) return detail.unifiedDiff
  if (detail.oldString === undefined || detail.newString === undefined || detail.oldString === detail.newString) return ""
  // OpenTUI already installs jsdiff; use its parser-compatible patch builder.
  return createPatch(detail.filePath, detail.oldString, detail.newString)
}

export function collapseToolOutput(output: string, maxLines = 10, maxChars = Infinity) {
  const lines = output.split("\n")
  if (lines.length <= maxLines && Array.from(output).length <= maxChars) return { output, overflow: false }
  const preview = lines.slice(0, maxLines).join("\n")
  if (Array.from(preview).length > maxChars) {
    return { output: Array.from(preview).slice(0, Math.max(0, maxChars - 1)).join("") + "…", overflow: true }
  }
  return { output: preview + "\n…", overflow: true }
}

export function reasoningSummary(text: string) {
  const content = text.trim()
  const title = content.match(/^\*\*([^*\n]+)\*\*(?:\r?\n\r?\n|$)/)
  return title?.[1]?.trim() ?? content.split(/\r?\n/, 1)[0]?.replace(/^#+\s*/, "") ?? ""
}

export function timestampLabel(timestamp: number, now = new Date(), locale = timeLocale()) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ""
  const time = date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
  return date.toDateString() === now.toDateString() ? time : `${date.toLocaleDateString(locale)} ${time}`
}

/**
 * The locale for dates and times: LC_ALL, then LC_TIME, then LANG, as POSIX programs read them. Bun's Intl only looks
 * at LANG, so a system with English text and Norwegian times (LANG=en_US, LC_TIME=nb_NO) would get AM/PM otherwise.
 * "nb_NO.UTF-8" becomes "nb-NO"; C, POSIX, and unknown values fall through; undefined means the runtime default.
 */
export function timeLocale(env: Record<string, string | undefined> = process.env): string | undefined {
  for (const name of ["LC_ALL", "LC_TIME", "LANG"]) {
    const value = env[name]?.split(/[.@]/)[0]?.replace("_", "-")
    if (!value || value === "C" || value === "POSIX") continue
    try {
      if (Intl.DateTimeFormat.supportedLocalesOf(value).length) return value
    } catch {
      // Not a valid language tag: try the next variable.
    }
  }
  return undefined
}

/** Who an agent-to-agent message came from: the sender's title, else its id (a UUID shortened like `paseo ls`). */
export function senderLabel(sender: { id: string; title?: string }) {
  return sender.title?.trim() || sender.id.replace(/^([0-9a-f]{8})-[0-9a-f-]{27}$/i, "$1")
}
