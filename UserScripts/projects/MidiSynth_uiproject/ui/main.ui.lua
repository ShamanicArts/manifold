-- MIDI Synthesizer Main UI
-- Full-featured synthesizer interface with keyboard, controls, and visualization

return {
  id = "root",
  type = "Panel",
  x = 0,
  y = 0,
  w = 1280,
  h = 720,
  style = {
    bg = 0xFF1A1A2E,  -- Dark blue background
  },
  behavior = "ui/behaviors/main.lua",
  children = {},
  components = {
    -- Header with title and master controls
    {
      id = "header",
      x = 0,
      y = 0,
      w = 1280,
      h = 60,
      behavior = "ui/behaviors/header.lua",
      ref = "ui/components/header.ui.lua",
    },
    
    -- Oscillator / Waveform Section
    {
      id = "oscillator_panel",
      x = 20,
      y = 70,
      w = 300,
      h = 200,
      behavior = "ui/behaviors/oscillator.lua",
      ref = "ui/components/oscillator.ui.lua",
    },
    
    -- Envelope (ADSR) Section
    {
      id = "envelope_panel",
      x = 340,
      y = 70,
      w = 300,
      h = 200,
      behavior = "ui/behaviors/envelope.lua",
      ref = "ui/components/envelope.ui.lua",
    },
    
    -- Filter Section
    {
      id = "filter_panel",
      x = 660,
      y = 70,
      w = 300,
      h = 200,
      behavior = "ui/behaviors/filter.lua",
      ref = "ui/components/filter.ui.lua",
    },
    
    -- Effects Section (Chorus, Delay, Reverb)
    {
      id = "effects_panel",
      x = 980,
      y = 70,
      w = 280,
      h = 400,
      behavior = "ui/behaviors/effects.lua",
      ref = "ui/components/effects.ui.lua",
    },
    
    -- Virtual Keyboard
    {
      id = "keyboard",
      x = 20,
      y = 480,
      w = 940,
      h = 120,
      behavior = "ui/behaviors/keyboard.lua",
      ref = "ui/components/keyboard.ui.lua",
    },
    
    -- Spectrum Analyzer
    {
      id = "spectrum",
      x = 20,
      y = 280,
      w = 640,
      h = 100,
      behavior = "ui/behaviors/spectrum.lua",
      ref = "ui/components/spectrum.ui.lua",
    },
    
    -- MIDI Monitor / Status
    {
      id = "midi_monitor",
      x = 680,
      y = 280,
      w = 280,
      h = 190,
      behavior = "ui/behaviors/midi_monitor.lua",
      ref = "ui/components/midi_monitor.ui.lua",
    },
    
    -- Preset Management
    {
      id = "preset_panel",
      x = 980,
      y = 480,
      w = 280,
      h = 120,
      behavior = "ui/behaviors/presets.lua",
      ref = "ui/components/presets.ui.lua",
    },
  },
}
