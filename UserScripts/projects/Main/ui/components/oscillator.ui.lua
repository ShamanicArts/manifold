return {
  id = "oscRoot",
  type = "Panel",
  x = 0, y = 0, w = 560, h = 200,
  style = { bg = 0xff121a2f, border = 0xff1f2b4d, borderWidth = 1, radius = 10 },
  -- Port definitions for signal routing visualization
  ports = {
    inputs = {
      { id = "cv_in", type = "cv", y = 0.35, label = "CV" }   -- Top-left (pitch CV)
    },
    outputs = {
      { id = "audio_out", type = "audio", y = 0.65, label = "OUT" }  -- Bottom-right (audio)
    }
  },
  children = {
    -- Title at top
    { id = "title", type = "Label", x = 16, y = 8, w = 200, h = 14, props = { text = "OSCILLATOR" }, style = { colour = 0xff7dd3fc, fontSize = 12 } },

    -- Graph on left (filled by behavior)
    { id = "osc_graph", type = "Panel", x = 10, y = 28, w = 270, h = 164, style = { bg = 0xff0d1420, border = 0xff1a1a3a, borderWidth = 1, radius = 6 } },

    -- TabHost on right for Wave/Sample switching
    {
      id = "mode_tabs",
      type = "TabHost",
      x = 290, y = 28, w = 260, h = 130,
      props = {
        activeIndex = 1,
        tabBarHeight = 24,
        tabSizing = "fill",
      },
      style = {
        bg = 0xff0b1220,
        border = 0xff1f2937,
        borderWidth = 1,
        radius = 6,
        tabBarBg = 0xff0d1420,
        tabBg = 0xff1e293b,
        activeTabBg = 0xff2563eb,
        textColour = 0xff94a3b8,
        activeTextColour = 0xffffffff,
      },
      children = {
        -- Wave Tab
        -- Dropdown sized to ~1 tab width (86px), positioned under leftmost "Wave" tab
        {
          id = "wave_tab",
          type = "TabPage",
          x = 0, y = 24, w = 260, h = 106,
          props = { title = "Wave" },
          style = { bg = 0x00000000 },
          children = {
            -- Dropdown: thin, snug against edge, square border
            { id = "waveform_dropdown", type = "Dropdown", x = 4, y = 4, w = 65, h = 20, props = { options = { "Sine", "Saw", "Square", "Triangle", "Blend", "Noise", "Pulse", "SuperSaw" }, selected = 2, max_visible_rows = 8 }, style = { bg = 0xff1e293b, colour = 0xff38bdf8, radius = 0 } },
            { id = "drive_knob", type = "Knob", x = 155, y = 4, w = 52, h = 48, props = { min = 0, max = 20, step = 0.1, value = 1.8, label = "Drive" }, style = { colour = 0xfff97316 } },

            -- Bottom row: 4 knobs with safe margins (tab is 260px wide)
            -- Knobs: 44px, gaps: 52px, margins: 10px each side
            { id = "pulse_width_knob", type = "Knob", x = 10, y = 58, w = 44, h = 44, props = { min = 0.01, max = 0.99, step = 0.01, value = 0.5, label = "Width" }, style = { colour = 0xffa78bfa } },
            { id = "unison_knob", type = "Knob", x = 62, y = 58, w = 44, h = 44, props = { min = 1, max = 8, step = 1, value = 1, label = "Unison" }, style = { colour = 0xff22d3ee } },
            { id = "detune_knob", type = "Knob", x = 114, y = 58, w = 44, h = 44, props = { min = 0, max = 100, step = 1, value = 0, label = "Detune" }, style = { colour = 0xff4ade80 } },
            { id = "spread_knob", type = "Knob", x = 166, y = 58, w = 44, h = 44, props = { min = 0, max = 1, step = 0.01, value = 0, label = "Spread" }, style = { colour = 0xfffbbf24 } },
          },
        },
        -- Sample Tab
        {
          id = "sample_tab",
          type = "TabPage",
          x = 0, y = 24, w = 260, h = 106,
          props = { title = "Sample" },
          style = { bg = 0x00000000 },
          children = {
            -- Dropdown: thin, snug against edge, square border
            { id = "sample_source_dropdown", type = "Dropdown", x = 4, y = 4, w = 65, h = 20, props = { options = { "Live", "L1", "L2", "L3", "L4" }, selected = 1, max_visible_rows = 6 }, style = { bg = 0xff1e293b, colour = 0xff22d3ee, fontSize = 10, radius = 0 } },
            { id = "sample_capture_button", type = "Button", x = 118, y = 8, w = 80, h = 20, props = { label = "Cap" }, style = { bg = 0xff334155, colour = 0xffe2e8f0, fontSize = 10 } },

            -- Row 2: Bars + Root (range view disabled - only global supported)
            { id = "sample_bars_box", type = "NumberBox", x = 10, y = 34, w = 70, h = 22, props = { min = 0.0625, max = 16.0, step = 0.0625, value = 1.0, label = "Bars", format = "%.3f" }, style = { colour = 0xff22d3ee, fontSize = 9 } },
            { id = "sample_root_box", type = "NumberBox", x = 85, y = 34, w = 70, h = 22, props = { min = 12, max = 96, step = 1, value = 60, label = "Root", format = "%d" }, style = { colour = 0xfffbbf24, fontSize = 9 } },
            --[[ NOTE: range_view_dropdown disabled - only global view supported
            { id = "range_view_dropdown", type = "Dropdown", x = 120, y = 34, w = 60, h = 22, props = { options = { "All", "Glob", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8" }, selected = 1, max_visible_rows = 10 }, style = { bg = 0xff1e293b, colour = 0xffe2e8f0, fontSize = 9 } },
            --]]

            -- Row 3: Start + Len + X-Fade
            { id = "sample_start_box", type = "NumberBox", x = 10, y = 60, w = 60, h = 22, props = { min = 0, max = 95, step = 1, value = 0, label = "Start%", format = "%d" }, style = { colour = 0xffa78bfa, fontSize = 9 } },
            { id = "sample_len_box", type = "NumberBox", x = 75, y = 60, w = 60, h = 22, props = { min = 5, max = 100, step = 1, value = 100, label = "Len%", format = "%d" }, style = { colour = 0xff34d399, fontSize = 9 } },
            { id = "sample_xfade_box", type = "NumberBox", x = 140, y = 60, w = 60, h = 22, props = { min = 0, max = 50, step = 1, value = 10, label = "X-Fade", format = "%d" }, style = { colour = 0xfff472b6, fontSize = 9 } },
          },
        },
        -- Blend Tab
        {
          id = "blend_tab",
          type = "TabPage",
          x = 0, y = 24, w = 260, h = 106,
          props = { title = "Blend" },
          style = { bg = 0x00000000 },
          children = {
            -- Dropdown: thin, snug against edge, square border
            { id = "blend_mode_dropdown", type = "Dropdown", x = 4, y = 4, w = 65, h = 20, props = { options = { "Mix", "Ring", "FM", "Sync", "XOR" }, selected = 1, max_visible_rows = 5 }, style = { bg = 0xff1e293b, colour = 0xff22d3ee, fontSize = 10, radius = 0 } },
            { id = "blend_key_track_toggle", type = "Toggle", x = 132, y = 8, w = 28, h = 18, props = { label = "KT", value = true }, style = { offColour = 0xff334155, onColour = 0xff3b82f6, fontSize = 9 } },
            { id = "blend_amount_knob", type = "Knob", x = 166, y = 4, w = 44, h = 44, props = { min = 0, max = 1, step = 0.01, value = 0.5, label = "Blend" }, style = { colour = 0xfff59e0b } },

            -- Bottom row: four compact controls with safe margins
            { id = "wave_to_sample_knob", type = "Knob", x = 10, y = 58, w = 44, h = 44, props = { min = 0, max = 1, step = 0.01, value = 0.5, label = "W→S" }, style = { colour = 0xffc084fc } },
            { id = "sample_to_wave_knob", type = "Knob", x = 62, y = 58, w = 44, h = 44, props = { min = 0, max = 1, step = 0.01, value = 0.0, label = "S→W" }, style = { colour = 0xff4ade80 } },
            { id = "blend_sample_pitch_knob", type = "Knob", x = 114, y = 58, w = 44, h = 44, props = { min = -24, max = 24, step = 1, value = 0, label = "Pitch" }, style = { colour = 0xfff472b6 } },
            { id = "blend_mod_amount_knob", type = "Knob", x = 166, y = 58, w = 44, h = 44, props = { min = 0, max = 1, step = 0.01, value = 0.5, label = "Depth" }, style = { colour = 0xfffb923c } },
          },
        },
      },
    },

    -- Output knob always visible at bottom (outside TabHost)
    { id = "output_knob", type = "Knob", x = 375, y = 164, w = 60, h = 70, props = { min = 0, max = 1, step = 0.01, value = 0.8, label = "Output" }, style = { colour = 0xff34d399 } },
  },
  
  -- Port definitions for signal router:
  -- CV Input: x = -4, y = 100 (center-left)
  -- Audio Output: x = 556, y = 100 (center-right)
}
