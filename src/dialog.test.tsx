import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/solid"
import { afterEach, expect, test } from "bun:test"
import { dialog, DialogHost, DialogSelect } from "./dialog"

let screen: TestRendererSetup | undefined
afterEach(() => {
  dialog.clear()
  screen?.renderer.destroy()
  screen = undefined
})

test("hovering a row reports it through onMove, like the arrow keys", async () => {
  const moved: string[] = []
  screen = await testRender(() => <DialogHost />, { width: 100, height: 30 })
  dialog.replace(() => (
    <DialogSelect
      title="Pick"
      options={[{ title: "Alpha", value: "a" }, { title: "Beta", value: "b" }, { title: "Gamma", value: "c" }]}
      onSelect={() => {}}
      onMove={(option) => moved.push(option.value)}
    />
  ))
  await screen.renderOnce()
  moved.length = 0
  const lines = screen.captureCharFrame().split("\n")
  const row = lines.findIndex((line) => line.includes("Gamma"))
  expect(row).toBeGreaterThan(-1)
  await screen.mockMouse.moveTo(lines[row]!.indexOf("Gamma"), row)
  await screen.renderOnce()
  expect(moved).toEqual(["c"])
  // Moving within the same row doesn't report it again.
  await screen.mockMouse.moveTo(lines[row]!.indexOf("Gamma") + 2, row)
  await screen.renderOnce()
  expect(moved).toEqual(["c"])
})
