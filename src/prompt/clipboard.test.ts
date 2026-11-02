import { expect, test } from "bun:test"
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { readClipboard } from "./clipboard"

test("pasted image paths preserve MIME and base64 across supported extensions", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pasode-attachment-test-"))
  try {
    for (const [extension, mimeType] of [["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["gif", "image/gif"], ["webp", "image/webp"]] as const) {
      await writeFile(path.join(directory, `image.${extension}`), "bytes")
      expect(await readClipboard(`image.${extension}`, directory)).toEqual({ image: { data: Buffer.from("bytes").toString("base64"), mimeType } })
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("non-attachments and invalid file URLs remain literal pasted text", async () => {
  for (const text of ["ordinary\r\ntext", "  ", "https://example.org/image.png", "/not-a-real-file.png", "file://remote-host/image.png", "file:///image%2Ftest.png", "file:///"]) {
    expect(await readClipboard(text)).toEqual({ text })
  }
})

test("local image reads reject files larger than OpenCode's 20 MB bound", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pasode-attachment-limit-test-"))
  const file = path.join(directory, "large.png")
  try {
    await writeFile(file, "")
    await truncate(file, 20 * 1024 * 1024 + 1)
    await expect(readClipboard(file)).rejects.toThrow("20 MB")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

// Linux: wl-paste on Wayland, xclip on X11. A fake runner stands in for the tools, keyed by "cmd arg arg".
import { pickImageType, readLinuxClipboard, type Run } from "./clipboard"

function fakeRun(outputs: Record<string, string | Buffer | Error>): Run & { calls: string[] } {
  const calls: string[] = []
  const run = (async (cmd: string, args: string[]) => {
    const key = [cmd, ...args].join(" ")
    calls.push(key)
    const out = outputs[key]
    if (out === undefined || out instanceof Error) throw out ?? new Error(`not found: ${key}`)
    return Buffer.isBuffer(out) ? out : Buffer.from(out)
  }) as Run & { calls: string[] }
  run.calls = calls
  return run
}

test("pickImageType prefers PNG, accepts the other supported types, ignores the rest", () => {
  expect(pickImageType(["text/plain", "image/jpeg", "image/png"])).toBe("image/png")
  expect(pickImageType(["TARGETS", "image/webp"])).toBe("image/webp")
  expect(pickImageType(["image/bmp", "text/plain;charset=utf-8"])).toBeUndefined()
  expect(pickImageType([])).toBeUndefined()
})

test("Wayland: an image on the clipboard becomes an attachment", async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  const run = fakeRun({
    "wl-paste --list-types": "text/plain\nimage/png\n",
    "wl-paste --no-newline --type image/png": png,
  })
  expect(await readLinuxClipboard({ WAYLAND_DISPLAY: "wayland-1" }, run)).toEqual({ image: { data: png.toString("base64"), mimeType: "image/png" } })
})

test("Wayland: text on the clipboard is pasted as text", async () => {
  const run = fakeRun({
    "wl-paste --list-types": "text/plain;charset=utf-8\nUTF8_STRING\n",
    "wl-paste --no-newline": "hello\nworld",
  })
  expect(await readLinuxClipboard({ WAYLAND_DISPLAY: "wayland-1" }, run)).toEqual({ text: "hello\nworld" })
})

test("X11: xclip TARGETS select the image type", async () => {
  const run = fakeRun({
    "xclip -selection clipboard -t TARGETS -o": "TARGETS\nimage/png\nimage/jpeg\n",
    "xclip -selection clipboard -t image/png -o": "img",
  })
  expect(await readLinuxClipboard({ DISPLAY: ":0" }, run)).toEqual({ image: { data: Buffer.from("img").toString("base64"), mimeType: "image/png" } })
})

test("Wayland without wl-paste falls back to xclip (XWayland)", async () => {
  const run = fakeRun({
    "xclip -selection clipboard -t TARGETS -o": "UTF8_STRING\n",
    "xclip -selection clipboard -o": "from xclip",
  })
  expect(await readLinuxClipboard({ WAYLAND_DISPLAY: "wayland-1", DISPLAY: ":0" }, run)).toEqual({ text: "from xclip" })
  expect(run.calls[0]).toBe("wl-paste --list-types")
})

test("no clipboard tool or an empty clipboard gives empty text, never an error", async () => {
  expect(await readLinuxClipboard({ WAYLAND_DISPLAY: "wayland-1", DISPLAY: ":0" }, fakeRun({}))).toEqual({ text: "" })
  expect(await readLinuxClipboard({}, fakeRun({}))).toEqual({ text: "" })
  const empty = fakeRun({ "wl-paste --list-types": "image/png\n", "wl-paste --no-newline --type image/png": Buffer.alloc(0), "wl-paste --no-newline": "" })
  expect(await readLinuxClipboard({ WAYLAND_DISPLAY: "wayland-1" }, empty)).toEqual({ text: "" })
})

test("clipboard images over 20 MB are rejected like local files", async () => {
  const run = fakeRun({
    "wl-paste --list-types": "image/png\n",
    "wl-paste --no-newline --type image/png": Buffer.alloc(20 * 1024 * 1024 + 1),
  })
  await expect(readLinuxClipboard({ WAYLAND_DISPLAY: "wayland-1" }, run)).rejects.toThrow("20 MB")
})
