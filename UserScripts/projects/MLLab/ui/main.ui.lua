return {
  id = "root",
  type = "Panel",
  behavior = "ui/behaviors/main.lua",
  x = 0, y = 0, w = 1280, h = 800,
  shellLayout = { mode = "fill", designW = 1280, designH = 800 },
  style = { bg = 0xff050816 },
  children = {
    { id = "title", type = "Label", x = 18, y = 14, w = 480, h = 28,
      props = { text = "ML LAB" },
      style = { colour = 0xffffffff, fontSize = 22, justification = Justify.centredLeft } },

    { id = "subtitle", type = "Label", x = 18, y = 42, w = 1160, h = 18,
      props = { text = "ONNX webcam segmentation: live feed → mask → composited foreground" },
      style = { colour = 0xff94a3b8, fontSize = 11, justification = Justify.centredLeft } },

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

    { id = "modelPanel", type = "Panel", x = 16, y = 132, w = 1248, h = 52,
      style = { bg = 0xff0f172a, border = 0xff334155, borderWidth = 1, radius = 8 } },

    { id = "loadModelBtn", type = "Button", x = 28, y = 144, w = 100, h = 28,
      props = { label = "Load Seg" },
      style = { bg = 0xff2563eb, textColour = 0xffffffff, fontSize = 11, radius = 5, border = 0xff60a5fa, borderWidth = 1 } },

    { id = "loadPoseModelBtn", type = "Button", x = 136, y = 144, w = 100, h = 28,
      props = { label = "Load Pose" },
      style = { bg = 0xff059669, textColour = 0xffffffff, fontSize = 11, radius = 5, border = 0xff34d399, borderWidth = 1 } },

    { id = "modelPathLabel", type = "Label", x = 248, y = 148, w = 360, h = 18,
      props = { text = "No model loaded" },
      style = { colour = 0xff94a3b8, fontSize = 10, justification = Justify.centredLeft } },

    { id = "modelInfo", type = "Label", x = 620, y = 148, w = 500, h = 18,
      props = { text = "" },
      style = { colour = 0xff64748b, fontSize = 10, justification = Justify.centredLeft } },

    { id = "inferBtn", type = "Button", x = 1140, y = 144, w = 110, h = 28,
      props = { label = "Snapshot" },
      style = { bg = 0xff7c3aed, textColour = 0xffffffff, fontSize = 11, radius = 5, border = 0xffa78bfa, borderWidth = 1 } },

    { id = "liveViewport", type = "Panel", x = 18, y = 206, w = 392, h = 228,
      style = { bg = 0xff000000, border = 0xff22d3ee, borderWidth = 1, radius = 8 } },
    { id = "liveLabel", type = "Label", x = 28, y = 212, w = 360, h = 18,
      props = { text = "live video" },
      style = { colour = 0xff22d3ee, fontSize = 10, justification = Justify.centredLeft } },

    { id = "maskViewport", type = "Panel", x = 444, y = 206, w = 392, h = 228,
      style = { bg = 0xff000000, border = 0xfff97316, borderWidth = 1, radius = 8 } },
    { id = "maskLabel", type = "Label", x = 454, y = 212, w = 360, h = 18,
      props = { text = "segmentation mask" },
      style = { colour = 0xfff97316, fontSize = 10, justification = Justify.centredLeft } },

    { id = "compositeViewport", type = "Panel", x = 870, y = 206, w = 392, h = 228,
      style = { bg = 0xff000000, border = 0xffa78bfa, borderWidth = 1, radius = 8 } },
    { id = "compositeLabel", type = "Label", x = 880, y = 212, w = 360, h = 18,
      props = { text = "composited foreground" },
      style = { colour = 0xffa78bfa, fontSize = 10, justification = Justify.centredLeft } },

    { id = "paramPanel", type = "Panel", x = 18, y = 450, w = 1244, h = 112,
      style = { bg = 0xff0f172a, border = 0xff334155, borderWidth = 1, radius = 8 } },

    { id = "paramLabel", type = "Label", x = 34, y = 462, w = 320, h = 18,
      props = { text = "ML postprocess params" },
      style = { colour = 0xff94a3b8, fontSize = 12, justification = Justify.centredLeft } },

    { id = "param1", type = "Slider", x = 28, y = 490, w = 292, h = 26,
      props = { min = 0.25, max = 4.0, step = 0.05, value = 1.0, label = "Mask Gain", compact = true, showValue = true },
      style = { colour = 0xff38bdf8, bg = 0xff102033, fontSize = 9 } },

    { id = "param2", type = "Slider", x = 332, y = 490, w = 292, h = 26,
      props = { min = 0.0, max = 1.0, step = 0.01, value = 0.5, label = "Threshold", compact = true, showValue = true },
      style = { colour = 0xff22c55e, bg = 0xff102717, fontSize = 9 } },

    { id = "param3", type = "Slider", x = 636, y = 490, w = 292, h = 26,
      props = { min = 0.0, max = 1.0, step = 0.01, value = 0.15, label = "Feather", compact = true, showValue = true },
      style = { colour = 0xfff59e0b, bg = 0xff2f1e08, fontSize = 9 } },

    { id = "param4", type = "Slider", x = 940, y = 490, w = 292, h = 26,
      props = { min = 0.0, max = 1.0, step = 0.01, value = 0.10, label = "Background", compact = true, showValue = true },
      style = { colour = 0xffa78bfa, bg = 0xff1e1b33, fontSize = 9 } },

    { id = "toggle1", type = "Toggle", x = 28, y = 524, w = 148, h = 28,
      props = { value = true, onLabel = "Sigmoid On", offLabel = "Sigmoid Off" },
      style = { onColour = 0xff0ea5e9, offColour = 0xff334155, textColour = 0xffffffff, fontSize = 10, radius = 5 } },

    { id = "toggle2", type = "Toggle", x = 188, y = 524, w = 148, h = 28,
      props = { value = false, onLabel = "Invert On", offLabel = "Invert Off" },
      style = { onColour = 0xff7c3aed, offColour = 0xff334155, textColour = 0xffffffff, fontSize = 10, radius = 5 } },

    { id = "poseParam1", type = "Slider", x = 356, y = 524, w = 200, h = 26,
      props = { min = 0.0, max = 1.0, step = 0.01, value = 0.30, label = "Pose Conf", compact = true, showValue = true },
      style = { colour = 0xff22d3ee, bg = 0xff08212a, fontSize = 9 } },

    { id = "poseToggle1", type = "Toggle", x = 572, y = 524, w = 120, h = 28,
      props = { value = true, onLabel = "Skel On", offLabel = "Skel Off" },
      style = { onColour = 0xff059669, offColour = 0xff334155, textColour = 0xffffffff, fontSize = 10, radius = 5 } },

    { id = "poseToggle2", type = "Toggle", x = 704, y = 524, w = 120, h = 28,
      props = { value = false, onLabel = "Inspect On", offLabel = "Inspect Off" },
      style = { onColour = 0xffd97706, offColour = 0xff334155, textColour = 0xffffffff, fontSize = 10, radius = 5 } },

    { id = "paramStatus", type = "Label", x = 840, y = 528, w = 400, h = 18,
      props = { text = "Live params" },
      style = { colour = 0xff64748b, fontSize = 10, justification = Justify.centredLeft } },

    { id = "statusPanel", type = "Panel", x = 18, y = 576, w = 1244, h = 190,
      style = { bg = 0xff0f172a, border = 0xff334155, borderWidth = 1, radius = 8 } },

    { id = "outputLabel", type = "Label", x = 34, y = 590, w = 1200, h = 18,
      props = { text = "Output" },
      style = { colour = 0xff94a3b8, fontSize = 12, justification = Justify.centredLeft } },

    { id = "outputText", type = "Label", x = 34, y = 616, w = 1200, h = 128,
      props = { text = "No inference run yet" },
      style = { colour = 0xff64748b, fontSize = 10, justification = Justify.centredLeftTop } },

    { id = "footer", type = "Label", x = 18, y = 776, w = 1240, h = 18,
      props = { text = "Open webcam for continuous mask + composite output. Snapshot dumps a one-shot debug summary using the same model." },
      style = { colour = 0xff64748b, fontSize = 10, justification = Justify.centredLeft } },
  }
}
