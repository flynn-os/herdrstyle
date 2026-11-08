import test from "node:test";
import assert from "node:assert/strict";
import { applyLayoutPatchToTree, extractLayoutModel } from "../src/herdr-bridge.mjs";

const SAMPLE_LAYOUT = {
  id: "root",
  type: "row",
  background: "canvas",
  terminal_padding: [14, 12],
  children: [
    {
      id: "sidebar",
      type: "column",
      size: { px: 268 },
      resizable: false,
      children: [],
    },
    {
      id: "work",
      type: "column",
      children: [
        {
          id: "work-body",
          type: "row",
          padding: 8,
          gap: 8,
          children: [
            {
              id: "main",
              type: "block",
              content: {
                tab: "active",
                pane: {
                  radius: 10,
                  gap: 8,
                  lone: true,
                  border: { width: 1, color: "border" },
                  focus: { width: 1, color: "accent" },
                  header: {
                    content: { mod: "pane" },
                    reveal: "always",
                    height: 30,
                    position: "top",
                  },
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

test("extractLayoutModel reads pane and workspace geometry", () => {
  const model = extractLayoutModel(SAMPLE_LAYOUT);
  assert.equal(model.pane_radius, 10);
  assert.equal(model.pane_gap, 8);
  assert.equal(model.sidebar_width, 268);
  assert.equal(model.pane_focus_color, "accent");
});

test("applyLayoutPatchToTree updates pane radius, gap, opacity, and sidebar width", () => {
  const patched = applyLayoutPatchToTree(SAMPLE_LAYOUT, {
    pane_radius: 16,
    pane_gap: 12,
    terminal_opacity: 0.85,
    sidebar_width: 310,
    pane_header_enabled: false,
  });
  const model = extractLayoutModel(patched);
  assert.equal(model.pane_radius, 16);
  assert.equal(model.pane_gap, 12);
  assert.equal(model.terminal_opacity, 0.85);
  assert.equal(model.sidebar_width, 310);
  assert.equal(model.pane_header_enabled, false);
});
