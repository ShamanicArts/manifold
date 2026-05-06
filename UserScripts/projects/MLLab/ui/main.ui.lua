return {
  id = "root",
  type = "Panel",
  behavior = "ui/behaviors/main.lua",
  x = 0, y = 0, w = 1280, h = 800,
  shellLayout = { mode = "fill", designW = 1280, designH = 800 },
  style = { bg = 0xff050816 },
  children = {
    -- Header
    { id = "title", type = "Label", x = 18, y = 14, w = 480, h = 28,
      props = { text = "ML LAB" },
      style = { colour = 0xffffffff, fontSize = 22, justification = Justify.centredLeft } },

    { id = "subtitle", type = "Label", x = 18, y = 42, w = 1120, h = 18,
      props = { text = "TFLite inference pipeline: webcam → model → mask/output" },
      style = { colour = 0xff94a3b8, fontSize = 11, justification = Justify.centredLeft } },

    -- Webcam controls
    { id = "headerPanel", type = "Panel", x = 16, y = 72, w = 1248, h = 48,
      style = { bg = 0xff0f172a, border = 0xff334155, borderWidth = 1, radius = 8 } },

    { id = "refreshBtn", type = "Button", x = 28, y = 82, w = 72, h = 28,
      props = { label = "Devices" },
      style = { bg = 0xff1e293b, textColour = 0xffffffff, fontSize = 11, radius = 5, border = 0xff334155, borderWidth = 1 } },

    { id = "deviceSelect", type = "Dropdown", x = 108, y = 82, w = 200, h = 28,
      props = { options = { "Device 0" }, selected = 1 },
      style = { bg = 0xff111827, colour = 0xff22d3ee, fontSize = 10 } },

    { id = "openBtn", type = "Button", x = 320, y = 82, w = 70, h = 28,
      props = { label = "Open" },
      style = { bg = 0xff15803d, textColour = 0xffffffff, fontSize = 11, radius = 5, border = 0xff22c55e, borderWidth = 1 } },

    { id = "closeBtn", type = "Button", x = 400, y = 82, w = 70, h = 28,
      props = { label = "Close" },
      style = { bg = 0xff7f1d1d, textColour = 0xffffffff, fontSize = 11, radius = 5, border = 0xffef4444, borderWidth = 1 } },

    { id = "webcamStatus", type = "Label", x = 490, y = 86, w = 740, h = 18,
      props = { text = "Webcam: not opened" },
      style = { colour = 0xff94a3b8, fontSize = 10, justification = Justify.centredLeft } },

    -- Model controls
    { id = "modelPanel", type = "Panel", x = 16, y = 132, w = 1248, h = 52,
      style = { bg = 0xff0f172a, border = 0xff334155, borderWidth = 1, radius = 8 } },

    { id = "loadModelBtn", type = "Button", x = 28, y = 144, w = 100, h = 28,
      props = { label = "Load Model" },
      style = { bg = 0xff2563eb, textColour = 0xffffffff, fontSize = 11, radius = 5, border = 0xff60a5fa, borderWidth = 1 } },

    { id = "modelPathLabel", type = "Label", x = 140, y = 148, w = 360, h = 18,
      props = { text = "No model loaded" },
      style = { colour = 0xff94a3b8, fontSize = 10, justification = Justify.centredLeft } },

    { id = "modelInfo", type = "Label", x = 520, y = 148, w = 720, h = 18,
      props = { text = "" },
      style = { colour = 0xff64748b, fontSize = 10, justification = Justify.centredLeft } },

    { id = "inferBtn", type = "Button", x = 1140, y = 144, w = 110, h = 28,
      props = { label = "▶ Infer Once" },
      style = { bg = 0xff7c3aed, textColour = 0xffffffff, fontSize = 11, radius = 5, border = 0xffa78bfa, borderWidth = 1 } },

    -- Viewports
    { id = "liveViewport", type = "Panel", x = 18, y = 206, w = 600, h = 338,
      style = { bg = 0xff000000, border = 0xff22d3ee, borderWidth = 1, radius = 8 } },

    { id = "liveLabel", type = "Label", x = 28, y = 212, w = 560, h = 18,
      props = { text = "live video" },
      style = { colour = 0xff22d3ee, fontSize = 10, justification = Justify.centredLeft } },

    { id = "maskViewport", type = "Panel", x = 662, y = 206, w = 600, h = 338,
      style = { bg = 0xff000000, border = 0xfff97316, borderWidth = 1, radius = 8 } },

    { id = "maskLabel", type = "Label", x = 672, y = 212, w = 560, h = 18,
      props = { text = "model output" },
      style = { colour = 0xfff97316, fontSize = 10, justification = Justify.centredLeft } },

    -- Status / output area
    { id = "statusPanel", type = "Panel", x = 18, y = 566, w = 1244, h = 200,
      style = { bg = 0xff0f172a, border = 0xff334155, borderWidth = 1, radius = 8 } },

    { id = "outputLabel", type = "Label", x = 34, y = 580, w = 1200, h = 18,
      props = { text = "Output" },
      style = { colour = 0xff94a3b8, fontSize = 12, justification = Justify.centredLeft } },

    { id = "outputText", type = "Label", x = 34, y = 606, w = 1200, h = 140,
      props = { text = "No inference run yet" },
      style = { colour = 0xff64748b, fontSize = 10, justification = Justify.centredLeftTop } },

    { id = "footer", type = "Label", x = 18, y = 776, w = 1240, h = 18,
      props = { text = "Download selfie_segmentation.tflite from storage.googleapis.com/mediapipe-models/ and load it. Click Infer Once to run on the latest webcam frame." },
      style = { colour = 0xff64748b, fontSize = 10, justification = Justify.centredLeft } },
  }
}
