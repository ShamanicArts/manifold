return {
  type = "Panel",
  style = { bg = 0xff0f1f17, border = 0xff1f3b2d, borderWidth = 1, radius = 10 },
  children = {
    { id = "title", type = "Label", x = math.floor(12), y = math.floor(10), w = math.floor(120), h = math.floor(14), props = { text = "TRANSPOSE" }, style = { colour = 0xff4ade80, fontSize = 11 } },
    { id = "status_label", type = "Label", x = math.floor(12), y = math.floor(28), w = math.floor(212), h = math.floor(12), props = { text = "Shift ±0 st" }, style = { colour = 0xff94a3b8, fontSize = 8 } },
    { id = "preview_graph", type = "Panel", x = math.floor(12), y = math.floor(44), w = math.floor(212), h = math.floor(54), props = { interceptsMouse = false }, style = { bg = 0xff0d1812, border = 0xff1c2d23, borderWidth = 1, radius = 6 } },
    { id = "semitones_slider", type = "Slider", x = math.floor(12), y = math.floor(106), w = math.floor(212), h = math.floor(18), props = { min = -24, max = 24, step = 1, value = 0, label = "Semitones", compact = true, bidirectional = true, showValue = true }, style = { colour = 0xff22c55e, bg = 0xff112417, fontSize = 8 } },
    { id = "range_label", type = "Label", x = math.floor(12), y = math.floor(132), w = math.floor(212), h = math.floor(12), props = { text = "Range: -24 .. +24 st" }, style = { colour = 0xff86efac, fontSize = 8 } },
    { id = "preview_label", type = "Label", x = math.floor(12), y = math.floor(150), w = math.floor(212), h = math.floor(12), props = { text = "Preview: — -> —" }, style = { colour = 0xffbbf7d0, fontSize = 8 } },
  },
}
