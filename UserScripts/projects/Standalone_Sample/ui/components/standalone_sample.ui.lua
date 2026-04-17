return {
  id = "sampleRoot",
  type = "Panel",
  x = 0, y = 0, w = 472, h = 208,
  behavior = "ui/behaviors/standalone_sample.lua",
  children = {
    { id = "sample_graph", type = "Panel", x = 10, y = 10, w = 226, h = 126 },
    { id = "sample_panel", type = "Panel", x = 242, y = 10, w = 220, h = 188 },
    { id = "sample_source_dropdown", type = "Dropdown", x = 246, y = 18, w = 68, h = 20, props = { options = { "Audio Input", "Sidechain" }, selected = 1, max_visible_rows = 2 } },
  },
}
