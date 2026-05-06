local M = {}

M.NS = "/avsampler"
M.MAX = 8
M.MAX_MAPPINGS = 8
M.MAJOR_OFFSETS = { 0, 2, 4, 5, 7, 9, 11, 12 }
M.MAX_CAPTURE_SECONDS = 6.0
M.TOOLBAR_H = 28
M.VIDEO_CAPTURE_ID = "av_sampler_segmented_capture"
M.VIDEO_SAMPLER_ID = "av_sampler_clip"
M.PARAM_SYNC_INTERVAL = 1.0 / 30.0
M.SEGMENT_INGEST_INTERVAL = 1.0 / 15.0
M.POSE_INTERVAL = 1.0 / 12.0
M.PLAYBACK_UI_INTERVAL = 1.0 / 20.0
M.STATUS_INTERVAL = 0.20
M.DEFAULT_CAPTURE_W = 640
M.DEFAULT_CAPTURE_H = 480
M.ML_SOURCE_PARAM_SPECS = {
  { id = "gain", name = "Gain", min = 0.25, max = 4.0, default = 1.0, step = 0.05 },
  { id = "threshold", name = "Thresh", min = 0.0, max = 1.0, default = 0.5, step = 0.01 },
  { id = "feather", name = "Feather", min = 0.0, max = 1.0, default = 0.15, step = 0.01 },
  { id = "background", name = "BG", min = 0.001, max = 0.35, default = 0.02, step = 0.005 },
}
M.KEYPOINTS = {
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle"
}
M.DOCK_WINDOWS = {
  { key = "deck", title = "Deck", accent = 0xff22d3ee },
  { key = "stage", title = "Output / Stage", accent = 0xfff97316 },
  { key = "sources", title = "Capture / Sources", accent = 0xffa78bfa },
  { key = "waveform", title = "Waveform", accent = 0xffaa88aa },
  { key = "params", title = "Parameters / Inspector", accent = 0xff22c55e },
  { key = "compositor", title = "Compositor", accent = 0xfff97316 },
}

return M
