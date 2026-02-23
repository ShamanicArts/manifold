#include "LooperEditor.h"

#include <algorithm>
#include <array>
#include <cmath>

namespace {
constexpr std::array<float, 9> kSegmentBars{0.0625f, 0.125f, 0.25f, 0.5f, 1.0f,
                                            2.0f,    4.0f,   8.0f,  16.0f};

constexpr std::array<const char *, 9> kSegmentLabels{
    "1/16", "1/8", "1/4", "1/2", "1", "2", "4", "8", "16"};

juce::Colour hoverTint(const Canvas &c, juce::Colour base) {
  return c.isMouseOverOrDragging() ? base.brighter(0.15f) : base;
}

void drawPillButton(Canvas &c, juce::Graphics &g, const juce::String &text,
                    juce::Colour fill,
                    juce::Colour textColour = juce::Colours::white) {
  auto r = c.getLocalBounds().toFloat().reduced(1.0f);
  g.setColour(hoverTint(c, fill));
  g.fillRoundedRectangle(r, 7.0f);
  g.setColour(fill.brighter(0.3f));
  g.drawRoundedRectangle(r, 7.0f, 1.0f);
  g.setColour(textColour);
  g.setFont(13.0f);
  g.drawText(text, c.getLocalBounds(), juce::Justification::centred);
}

float steppedSpeed(float current, int direction) {
  constexpr std::array<float, 7> kSpeeds{0.25f, 0.5f, 0.75f, 1.0f,
                                         1.5f,  2.0f, 4.0f};

  int nearest = 0;
  float nearestDist = std::abs(current - kSpeeds[0]);
  for (int i = 1; i < (int)kSpeeds.size(); ++i) {
    const float d = std::abs(current - kSpeeds[(size_t)i]);
    if (d < nearestDist) {
      nearest = i;
      nearestDist = d;
    }
  }

  int next = juce::jlimit(0, (int)kSpeeds.size() - 1, nearest + direction);
  return kSpeeds[(size_t)next];
}

float steppedLayerVolume(float current, int direction) {
  constexpr std::array<float, 9> kVolumes{0.0f,  0.25f, 0.5f,  0.75f, 1.0f,
                                          1.25f, 1.5f,  1.75f, 2.0f};

  int nearest = 0;
  float nearestDist = std::abs(current - kVolumes[0]);
  for (int i = 1; i < (int)kVolumes.size(); ++i) {
    const float d = std::abs(current - kVolumes[(size_t)i]);
    if (d < nearestDist) {
      nearest = i;
      nearestDist = d;
    }
  }

  int next = juce::jlimit(0, (int)kVolumes.size() - 1, nearest + direction);
  return kVolumes[(size_t)next];
}

float steppedTempo(float current, int direction) {
  const float step = 2.0f;
  return juce::jlimit(40.0f, 240.0f, current + step * (float)direction);
}

float steppedMasterVolume(float current, int direction) {
  const float step = 0.05f;
  return juce::jlimit(0.0f, 1.0f, current + step * (float)direction);
}
} // namespace

LooperEditor::LooperEditor(LooperProcessor &p)
    : juce::AudioProcessorEditor(p), processor(p) {
  setSize(980, 680);

  addAndMakeVisible(rootCanvas);

  // Try to load Lua UI script
  luaEngine.initialise(&processor, &rootCanvas);

  // Look for looper_ui.lua next to the plugin binary, or in project root
  juce::File scriptFile;
  auto binaryDir =
      juce::File::getSpecialLocation(juce::File::currentExecutableFile)
          .getParentDirectory();
  auto candidate1 = binaryDir.getChildFile("looper_ui.lua");
  auto candidate2 = binaryDir.getParentDirectory().getChildFile(
      "looper_ui.lua"); // one level up
  auto candidate3 =
      juce::File("/home/shamanic/dev/my-plugin/looper/ui/looper_ui.lua");

  if (candidate1.existsAsFile())
    scriptFile = candidate1;
  else if (candidate2.existsAsFile())
    scriptFile = candidate2;
  else if (candidate3.existsAsFile())
    scriptFile = candidate3;

  if (scriptFile.existsAsFile()) {
    usingLuaUi = luaEngine.loadScript(scriptFile);
    if (usingLuaUi) {
      std::fprintf(stderr, "LooperEditor: Using Lua UI from %s\n",
                   scriptFile.getFullPathName().toRawUTF8());
    } else {
      std::fprintf(stderr,
                   "LooperEditor: Lua script failed, falling back to C++ UI. "
                   "Error: %s\n",
                   luaEngine.getLastError().c_str());
    }
  } else {
    std::fprintf(stderr,
                 "LooperEditor: No looper_ui.lua found, using C++ UI\n");
  }

  if (!usingLuaUi) {
    buildCanvasUi();
  }

  startTimerHz(30);
  resized();
}

void LooperEditor::timerCallback() {
  if (usingLuaUi) {
    luaEngine.notifyUpdate();
    rootCanvas.repaint();
  } else {
    refreshUiState();
  }
}

void LooperEditor::paint(juce::Graphics &g) {
  juce::ColourGradient bg(juce::Colour(0xff161b26), 0.0f, 0.0f,
                          juce::Colour(0xff0c1019), 0.0f, (float)getHeight(),
                          false);
  bg.addColour(0.35, juce::Colour(0xff1e2533));
  g.setGradientFill(bg);
  g.fillAll();
}

void LooperEditor::resized() {
  rootCanvas.setBounds(getLocalBounds().reduced(12));
  if (usingLuaUi) {
    luaEngine.notifyResized(rootCanvas.getWidth(), rootCanvas.getHeight());
  } else {
    layoutCanvasUi();
  }
}

void LooperEditor::buildCanvasUi() {
  rootCanvas.clearChildren();
  captureNowIndicator = nullptr;
  captureStrips.clear();
  captureSegments.clear();

  titleNode = rootCanvas.addChild("title");
  titleNode->onDraw = [this](Canvas &, juce::Graphics &g) {
    auto b = titleNode->getLocalBounds();
    g.setColour(juce::Colour(0xff7dd3fc));
    g.setFont(juce::Font("Avenir Next", 29.0f, juce::Font::bold));
    g.drawText("LOOPER", b.removeFromLeft(230),
               juce::Justification::centredLeft);

    g.setFont(juce::Font("Avenir Next", 14.0f, juce::Font::plain));
    g.setColour(juce::Colour(0xff9ca3af));
    g.drawText("Capture plane + composable controls", b,
               juce::Justification::centredRight);
  };

  controlsNode = rootCanvas.addChild("controls");
  controlsNode->style =
      controlsNode->style.withBackground(juce::Colour(0xff141a24))
          .withCornerRadius(10.0f);

  auto makeControlButton = [this](Canvas *parent, const juce::String &name,
                                  std::function<void()> onClick) {
    auto *node = parent->addChild(name);
    node->onClick = std::move(onClick);
    return node;
  };

  recButton = makeControlButton(controlsNode, "rec", [this] {
    if (processor.isRecording())
      processor.postControlCommand(ControlCommand::Type::StopRecording);
    else
      processor.postControlCommand(ControlCommand::Type::StartRecording);
  });
  recButton->onDraw = [this](Canvas &c, juce::Graphics &g) {
    const bool recording = processor.isRecording();
    drawPillButton(c, g, recording ? "REC*" : "REC",
                   recording ? juce::Colour(0xffdc2626)
                             : juce::Colour(0xff7f1d1d));
  };

  overdubButton = makeControlButton(controlsNode, "overdub", [this] {
    processor.postControlCommand(ControlCommand::Type::ToggleOverdub);
  });
  overdubButton->onDraw = [this](Canvas &c, juce::Graphics &g) {
    const bool active = processor.isOverdubEnabled();
    drawPillButton(c, g, active ? "OVERDUB*" : "OVERDUB",
                   active ? juce::Colour(0xfff59e0b)
                          : juce::Colour(0xff7c4a03));
  };

  stopButton = makeControlButton(controlsNode, "stop", [this] {
    processor.postControlCommand(ControlCommand::Type::StopRecording);
  });
  stopButton->onDraw = [](Canvas &c, juce::Graphics &g) {
    drawPillButton(c, g, "STOP", juce::Colour(0xff374151));
  };

  modeButton = makeControlButton(controlsNode, "mode", [this] {
    const int next = (static_cast<int>(processor.getRecordMode()) + 1) % 4;
    processor.postControlCommand(ControlCommand::Type::SetRecordMode, next);
  });
  modeButton->onDraw = [this](Canvas &c, juce::Graphics &g) {
    drawPillButton(c, g, recordModeText(processor.getRecordMode()),
                   juce::Colour(0xff1f4a7a));
  };

  clearButton = makeControlButton(controlsNode, "clear", [this] {
    processor.postControlCommand(ControlCommand::Type::LayerClear,
                                 processor.getActiveLayerIndex());
  });
  clearButton->onDraw = [](Canvas &c, juce::Graphics &g) {
    drawPillButton(c, g, "CLEAR", juce::Colour(0xff4b5563));
  };

  clearAllButton = makeControlButton(controlsNode, "clearall", [this] {
    processor.postControlCommand(ControlCommand::Type::ClearAllLayers);
  });
  clearAllButton->onDraw = [](Canvas &c, juce::Graphics &g) {
    drawPillButton(c, g, "CLEAR ALL", juce::Colour(0xff111827));
  };

  tempoDownButton = makeControlButton(controlsNode, "tempo_down", [this] {
    processor.postControlCommand(ControlCommand::Type::SetTempo, 0,
                                 steppedTempo(processor.getTempo(), -1));
  });
  tempoDownButton->onDraw = [](Canvas &c, juce::Graphics &g) {
    drawPillButton(c, g, "TMP-", juce::Colour(0xff2f3f56));
  };

  tempoUpButton = makeControlButton(controlsNode, "tempo_up", [this] {
    processor.postControlCommand(ControlCommand::Type::SetTempo, 0,
                                 steppedTempo(processor.getTempo(), +1));
  });
  tempoUpButton->onDraw = [](Canvas &c, juce::Graphics &g) {
    drawPillButton(c, g, "TMP+", juce::Colour(0xff2f3f56));
  };

  volumeDownButton = makeControlButton(controlsNode, "vol_down", [this] {
    processor.postControlCommand(
        ControlCommand::Type::SetMasterVolume, 0,
        steppedMasterVolume(processor.getMasterVolume(), -1));
  });
  volumeDownButton->onDraw = [](Canvas &c, juce::Graphics &g) {
    drawPillButton(c, g, "VOL-", juce::Colour(0xff423046));
  };

  volumeUpButton = makeControlButton(controlsNode, "vol_up", [this] {
    processor.postControlCommand(
        ControlCommand::Type::SetMasterVolume, 0,
        steppedMasterVolume(processor.getMasterVolume(), +1));
  });
  volumeUpButton->onDraw = [](Canvas &c, juce::Graphics &g) {
    drawPillButton(c, g, "VOL+", juce::Colour(0xff423046));
  };

  captureNode = rootCanvas.addChild("capture");
  captureNode->style =
      captureNode->style.withBackground(juce::Colour(0xff101723))
          .withCornerRadius(10.0f);
  captureNode->onDraw = [this](Canvas &, juce::Graphics &g) {
    auto b = captureNode->getLocalBounds();
    g.setColour(juce::Colour(0xff9ca3af));
    g.setFont(juce::Font("Avenir Next", 13.0f, juce::Font::plain));

    auto title = b.removeFromTop(22).reduced(10, 0);
    const bool forwardArmed = processor.isForwardCommitArmed();
    juce::String caption = "Capture Plane (right = now, left = older)";
    if (forwardArmed) {
      caption << "  |  FORWARD ARMED "
              << juce::String(processor.getForwardCommitBars(), 3) << " bars";
    } else if (processor.getRecordMode() == RecordMode::Traditional) {
      caption << "  |  Traditional mode: click segment to arm FORWARD";
    } else {
      caption << "  |  Click a segment to COMMIT";
    }
    g.drawText(caption, title, juce::Justification::centredLeft);

    auto wave = b.reduced(10, 10);
    g.setColour(juce::Colour(0xff0b1220));
    g.fillRoundedRectangle(wave.toFloat(), 8.0f);
    g.setColour(juce::Colour(0xff253041));
    g.drawRoundedRectangle(wave.toFloat(), 8.0f, 1.0f);

    g.setColour(juce::Colour(0xff94a3b8));
    g.setFont(juce::Font("Avenir Next", 11.0f, juce::Font::plain));
    g.drawText("older", wave.removeFromLeft(52),
               juce::Justification::centredLeft);
    g.drawText("now", wave.removeFromRight(52),
               juce::Justification::centredRight);
  };

  // Bespoke reference:
  // - fixed-width strips, each strip visualizes its own bar length
  // - cumulative hit regions from the right (now) toward the left (older)
  for (int slot = 0; slot < (int)kSegmentBars.size(); ++slot) {
    const int barsIndex = (int)kSegmentBars.size() - 1 - slot;
    CaptureSegment strip;
    strip.bars = kSegmentBars[(size_t)barsIndex];
    strip.label = kSegmentLabels[(size_t)barsIndex];
    strip.node = captureNode->addChild("strip_" + juce::String(slot));
    strip.node->setInterceptsMouseClicks(false, false);

    const float endBars = strip.bars;
    const float startBars =
        (barsIndex > 0) ? kSegmentBars[(size_t)(barsIndex - 1)] : 0.0f;
    const juce::String label = strip.label;
    strip.node->onDraw = [this, startBars, endBars, label](Canvas &c,
                                                           juce::Graphics &g) {
      const int rangeStart =
          (int)std::round(startBars * processor.getSamplesPerBar());
      const int rangeEnd =
          (int)std::round(endBars * processor.getSamplesPerBar());
      const int captureSize = processor.getCaptureBuffer().getSize();
      const int clippedStart = juce::jlimit(0, captureSize, rangeStart);
      const int clippedEnd = juce::jlimit(0, captureSize, rangeEnd);
      const bool hasRange = clippedEnd > clippedStart;

      auto r = c.getLocalBounds().toFloat();
      g.setColour(hasRange ? juce::Colour(0xff0f1b2d)
                           : juce::Colour(0xff111827));
      g.fillRect(r);

      g.setColour(juce::Colour(0x22ffffff));
      g.drawHorizontalLine(c.getHeight() / 2, 0.0f, (float)c.getWidth());

      if (hasRange) {
        drawCaptureWindowWaveform(g, c.getLocalBounds().reduced(2),
                                  clippedStart, clippedEnd,
                                  juce::Colour(0xff22d3ee));
      }

      g.setColour(juce::Colour(0x40475569));
      g.drawRect(c.getLocalBounds());

      g.setColour(hasRange ? juce::Colour(0xffcbd5e1)
                           : juce::Colour(0xff6b7280));
      g.setFont(juce::Font("Avenir Next", 10.0f, juce::Font::bold));
      g.drawText(label, c.getLocalBounds().reduced(4, 0),
                 juce::Justification::bottomLeft);
    };

    captureStrips.push_back(strip);
  }

  captureSegments.resize(kSegmentBars.size());
  for (int i = (int)kSegmentBars.size() - 1; i >= 0; --i) {
    CaptureSegment seg;
    seg.bars = kSegmentBars[(size_t)i];
    seg.label = kSegmentLabels[(size_t)i];
    seg.node = captureNode->addChild("segment_hit_" + juce::String(i));

    const float bars = seg.bars;
    const juce::String label = seg.label;
    seg.node->onClick = [this, bars] { onCaptureSegmentClicked(bars); };
    seg.node->onDraw = [this, bars, label](Canvas &c, juce::Graphics &g) {
      auto r = c.getLocalBounds().toFloat();
      const bool hovered = c.isMouseOverOrDragging();
      const bool armed =
          processor.isForwardCommitArmed() &&
          std::abs(processor.getForwardCommitBars() - bars) < 0.001f;

      if (hovered) {
        g.setColour(juce::Colour(0x2a60a5fa));
        g.fillRect(r);
        g.setColour(juce::Colour(0xff60a5fa));
        g.drawRect(c.getLocalBounds(), 1);
      }

      if (armed) {
        g.setColour(juce::Colour(0x3384cc16));
        g.fillRect(r);
        g.setColour(juce::Colour(0xff84cc16));
        g.drawRect(c.getLocalBounds(), 2);
      }

      if (hovered || armed) {
        g.setColour(armed ? juce::Colour(0xffd9f99d)
                          : juce::Colour(0xffbfdbfe));
        g.setFont(juce::Font("Avenir Next", 12.0f, juce::Font::bold));
        g.drawText(label + " bars", c.getLocalBounds().reduced(6, 0),
                   juce::Justification::topRight);
      }
    };

    captureSegments[(size_t)i] = seg;
  }

  captureNowIndicator = captureNode->addChild("now_indicator");
  captureNowIndicator->setInterceptsMouseClicks(false, false);
  captureNowIndicator->onDraw = [](Canvas &c, juce::Graphics &g) {
    g.setColour(juce::Colour(0xb3e2e8f0));
    g.drawVerticalLine(c.getWidth() - 1, 1.0f, (float)c.getHeight() - 1.0f);
  };

  layersNode = rootCanvas.addChild("layers");
  layersNode->style = layersNode->style.withBackground(juce::Colour(0xff0f1622))
                          .withCornerRadius(10.0f);

  auto makeLayerActionButton = [](Canvas *row, const juce::String &name,
                                  std::function<void()> action) {
    auto *node = row->addChild(name);
    node->onClick = std::move(action);
    return node;
  };

  for (int i = 0; i < LooperProcessor::MAX_LAYERS; ++i) {
    auto *row = layersNode->addChild("layer_row_" + juce::String(i));
    row->onClick = [this, i] {
      processor.postControlCommand(ControlCommand::Type::SetActiveLayer, i);
    };
    row->onDraw = [this, i](Canvas &c, juce::Graphics &g) {
      const auto &layer = processor.getLayer(i);
      const bool active = processor.getActiveLayerIndex() == i;

      auto r = c.getLocalBounds().toFloat().reduced(1.0f);
      const auto base =
          active ? juce::Colour(0xff25405f) : juce::Colour(0xff1b2636);
      g.setColour(hoverTint(c, base));
      g.fillRoundedRectangle(r, 8.0f);
      g.setColour(active ? juce::Colour(0xff7dd3fc) : juce::Colour(0xff334155));
      g.drawRoundedRectangle(r, 8.0f, 1.0f);

      auto body = c.getLocalBounds().reduced(10, 6);
      auto waveformArea = body;
      waveformArea.removeFromRight(340);
      auto metaArea = waveformArea.removeFromTop(18);

      g.setColour(active ? juce::Colour(0xffe2e8f0) : juce::Colour(0xff94a3b8));
      g.setFont(juce::Font("Avenir Next", 14.0f, juce::Font::bold));
      g.drawText("L" + juce::String(i), metaArea.removeFromLeft(28),
                 juce::Justification::centredLeft);

      g.setColour(layerStateColour(layer.getState()));
      g.setFont(juce::Font("Avenir Next", 13.0f, juce::Font::plain));
      g.drawText(layerStateText(layer.getState(), layer.getLength()),
                 metaArea.removeFromLeft(180),
                 juce::Justification::centredLeft);

      g.setColour(juce::Colour(0xffcbd5e1));
      const juce::String details =
          "speed " + juce::String(layer.getSpeed(), 2) +
          (layer.isReversed() ? " | rev" : "") + " | vol " +
          juce::String(layer.getVolume(), 2);
      g.drawText(details, metaArea, juce::Justification::centredRight);

      g.setColour(juce::Colour(0xff0b1220));
      g.fillRoundedRectangle(waveformArea.toFloat(), 4.0f);
      g.setColour(juce::Colour(0x30475569));
      g.drawRoundedRectangle(waveformArea.toFloat(), 4.0f, 1.0f);

      drawLayerWaveform(g, waveformArea.reduced(2), layer,
                        active ? juce::Colour(0xff22d3ee)
                               : juce::Colour(0xff38bdf8));

      if (layer.getLength() > 0 &&
          (layer.getState() == LooperLayer::State::Playing ||
           layer.getState() == LooperLayer::State::Muted ||
           layer.getState() == LooperLayer::State::Overdubbing)) {
        const float pos = (float)layer.getPosition() / (float)layer.getLength();
        const int x = waveformArea.getX() +
                      (int)std::round(pos * (float)waveformArea.getWidth());
        g.setColour(juce::Colour(0xffff4d4d));
        g.drawVerticalLine(x, (float)waveformArea.getY() + 1.0f,
                           (float)waveformArea.getBottom() - 1.0f);
      }
    };

    layerRows[(size_t)i] = row;

    layerMuteButtons[(size_t)i] =
        makeLayerActionButton(row, "mute_" + juce::String(i), [this, i] {
          auto &layer = processor.getLayer(i);
          const bool currentlyMuted =
              layer.getState() == LooperLayer::State::Muted;
          processor.postControlCommand(ControlCommand::Type::LayerMute, i,
                                       currentlyMuted ? 0.0f : 1.0f);
        });
    layerMuteButtons[(size_t)i]->onDraw = [this, i](Canvas &c,
                                                    juce::Graphics &g) {
      const bool on =
          processor.getLayer(i).getState() == LooperLayer::State::Muted;
      drawPillButton(c, g, "M",
                     on ? juce::Colour(0xffef4444) : juce::Colour(0xff475569));
    };

    layerReverseButtons[(size_t)i] =
        makeLayerActionButton(row, "rev_" + juce::String(i), [this, i] {
          auto &layer = processor.getLayer(i);
          processor.postControlCommand(ControlCommand::Type::LayerReverse, i,
                                       layer.isReversed() ? 0.0f : 1.0f);
        });
    layerReverseButtons[(size_t)i]->onDraw = [this, i](Canvas &c,
                                                       juce::Graphics &g) {
      const bool on = processor.getLayer(i).isReversed();
      drawPillButton(c, g, "R",
                     on ? juce::Colour(0xff16a34a) : juce::Colour(0xff475569));
    };

    layerStopButtons[(size_t)i] =
        makeLayerActionButton(row, "stop_" + juce::String(i), [this, i] {
          processor.postControlCommand(ControlCommand::Type::LayerStop, i);
        });
    layerStopButtons[(size_t)i]->onDraw = [](Canvas &c, juce::Graphics &g) {
      drawPillButton(c, g, "S", juce::Colour(0xff334155));
    };

    layerClearButtons[(size_t)i] =
        makeLayerActionButton(row, "clear_" + juce::String(i), [this, i] {
          processor.postControlCommand(ControlCommand::Type::LayerClear, i);
        });
    layerClearButtons[(size_t)i]->onDraw = [](Canvas &c, juce::Graphics &g) {
      drawPillButton(c, g, "C", juce::Colour(0xff1f2937));
    };

    layerSpeedDownButtons[(size_t)i] =
        makeLayerActionButton(row, "speed_down_" + juce::String(i), [this, i] {
          auto &layer = processor.getLayer(i);
          processor.postControlCommand(ControlCommand::Type::LayerSpeed, i,
                                       steppedSpeed(layer.getSpeed(), -1));
        });
    layerSpeedDownButtons[(size_t)i]->onDraw = [](Canvas &c,
                                                  juce::Graphics &g) {
      drawPillButton(c, g, "-", juce::Colour(0xff334155));
    };

    layerSpeedUpButtons[(size_t)i] =
        makeLayerActionButton(row, "speed_up_" + juce::String(i), [this, i] {
          auto &layer = processor.getLayer(i);
          processor.postControlCommand(ControlCommand::Type::LayerSpeed, i,
                                       steppedSpeed(layer.getSpeed(), +1));
        });
    layerSpeedUpButtons[(size_t)i]->onDraw = [](Canvas &c, juce::Graphics &g) {
      drawPillButton(c, g, "+", juce::Colour(0xff334155));
    };

    layerVolumeDownButtons[(size_t)i] =
        makeLayerActionButton(row, "volume_down_" + juce::String(i), [this, i] {
          auto &layer = processor.getLayer(i);
          processor.postControlCommand(
              ControlCommand::Type::LayerVolume, i,
              steppedLayerVolume(layer.getVolume(), -1));
        });
    layerVolumeDownButtons[(size_t)i]->onDraw = [](Canvas &c,
                                                   juce::Graphics &g) {
      drawPillButton(c, g, "V-", juce::Colour(0xff3f3f46));
    };

    layerVolumeUpButtons[(size_t)i] =
        makeLayerActionButton(row, "volume_up_" + juce::String(i), [this, i] {
          auto &layer = processor.getLayer(i);
          processor.postControlCommand(
              ControlCommand::Type::LayerVolume, i,
              steppedLayerVolume(layer.getVolume(), +1));
        });
    layerVolumeUpButtons[(size_t)i]->onDraw = [](Canvas &c, juce::Graphics &g) {
      drawPillButton(c, g, "V+", juce::Colour(0xff3f3f46));
    };
  }

  statusNode = rootCanvas.addChild("status");
  statusNode->style = statusNode->style.withBackground(juce::Colour(0xff0b1220))
                          .withCornerRadius(8.0f);
  statusNode->onDraw = [this](Canvas &, juce::Graphics &g) {
    auto b = statusNode->getLocalBounds().reduced(10, 0);
    g.setFont(juce::Font("Avenir Next", 12.0f, juce::Font::plain));
    g.setColour(juce::Colour(0xff94a3b8));

    const float samplesPerBar = processor.getSamplesPerBar();
    const float sr = (float)juce::jmax(1.0, processor.getSampleRate());
    const float barSeconds = samplesPerBar / sr;
    const auto left =
        "Tempo " + juce::String(processor.getTempo(), 2) + " BPM  |  1 bar " +
        juce::String(barSeconds, 3) + " s  |  target " +
        juce::String(processor.getTargetBPM(), 1) + "  |  master " +
        juce::String(processor.getMasterVolume(), 2) +
        (processor.isOverdubEnabled() ? "  |  overdub ON" : "  |  overdub OFF");
    g.drawText(left, b.removeFromLeft(statusNode->getWidth() - 180),
               juce::Justification::centredLeft);

    const auto &capture = processor.getCaptureBuffer();
    const int capSamples = capture.getSize();
    const auto right = "capture " + juce::String(capSamples) + " smp";
    g.drawText(right, b, juce::Justification::centredRight);
  };
}

void LooperEditor::layoutCanvasUi() {
  if (titleNode == nullptr || controlsNode == nullptr ||
      captureNode == nullptr || layersNode == nullptr || statusNode == nullptr)
    return;

  auto b = rootCanvas.getLocalBounds();
  titleNode->setBounds(b.removeFromTop(44));
  b.removeFromTop(8);
  controlsNode->setBounds(b.removeFromTop(56));
  b.removeFromTop(8);
  captureNode->setBounds(b.removeFromTop(212));
  b.removeFromTop(8);
  statusNode->setBounds(b.removeFromBottom(36));
  b.removeFromBottom(8);
  layersNode->setBounds(b);

  auto ctl = controlsNode->getLocalBounds().reduced(8, 8);
  constexpr int kControlCount = 10;
  constexpr int kControlGap = 6;
  const int buttonWidth =
      (ctl.getWidth() - kControlGap * (kControlCount - 1)) / kControlCount;
  auto placeControl = [&](Canvas *node) {
    if (node == nullptr)
      return;
    node->setBounds(ctl.removeFromLeft(buttonWidth));
    ctl.removeFromLeft(kControlGap);
  };
  placeControl(recButton);
  placeControl(overdubButton);
  placeControl(stopButton);
  placeControl(modeButton);
  placeControl(clearButton);
  placeControl(clearAllButton);
  placeControl(tempoDownButton);
  placeControl(tempoUpButton);
  placeControl(volumeDownButton);
  placeControl(volumeUpButton);

  auto captureArea = captureNode->getLocalBounds().reduced(12, 30);
  const int slotCount = juce::jmax(1, (int)kSegmentBars.size());
  const int slotWidth = juce::jmax(1, captureArea.getWidth() / slotCount);
  const int totalWidth = slotWidth * slotCount;
  const int x0 = captureArea.getRight() - totalWidth;

  for (int slot = 0; slot < (int)captureStrips.size(); ++slot) {
    auto *node = captureStrips[(size_t)slot].node;
    if (node == nullptr)
      continue;
    node->setBounds(x0 + slot * slotWidth, captureArea.getY(), slotWidth,
                    captureArea.getHeight());
  }

  for (int i = 0; i < (int)captureSegments.size(); ++i) {
    auto *node = captureSegments[(size_t)i].node;
    if (node == nullptr)
      continue;

    const int x = x0 + (slotCount - 1 - i) * slotWidth;
    const int width = (i + 1) * slotWidth;
    node->setBounds(x, captureArea.getY(), width, captureArea.getHeight());
  }

  if (captureNowIndicator != nullptr) {
    captureNowIndicator->setBounds(x0 + totalWidth - 2, captureArea.getY(), 2,
                                   captureArea.getHeight());
  }

  auto layerArea = layersNode->getLocalBounds().reduced(8);
  constexpr int rowGap = 8;
  const int rowHeight =
      (layerArea.getHeight() - rowGap * (LooperProcessor::MAX_LAYERS - 1)) /
      LooperProcessor::MAX_LAYERS;

  for (int i = 0; i < LooperProcessor::MAX_LAYERS; ++i) {
    auto *row = layerRows[(size_t)i];
    if (row == nullptr)
      continue;

    row->setBounds(layerArea.removeFromTop(rowHeight));
    layerArea.removeFromTop(rowGap);

    auto actions = row->getLocalBounds().reduced(8, 7).removeFromRight(336);
    constexpr int actionWidth = 36;
    constexpr int actionGap = 6;
    auto place = [&](Canvas *node) {
      if (node == nullptr)
        return;
      node->setBounds(actions.removeFromLeft(actionWidth));
      actions.removeFromLeft(actionGap);
    };

    place(layerSpeedDownButtons[(size_t)i]);
    place(layerSpeedUpButtons[(size_t)i]);
    place(layerMuteButtons[(size_t)i]);
    place(layerReverseButtons[(size_t)i]);
    place(layerVolumeDownButtons[(size_t)i]);
    place(layerVolumeUpButtons[(size_t)i]);
    place(layerStopButtons[(size_t)i]);
    place(layerClearButtons[(size_t)i]);
  }
}

void LooperEditor::refreshUiState() { rootCanvas.repaint(); }

void LooperEditor::onCaptureSegmentClicked(float bars) {
  if (processor.getRecordMode() == RecordMode::Traditional) {
    processor.postControlCommand(ControlCommand::Type::ForwardCommit, 0, bars);
  } else {
    processor.postControlCommand(ControlCommand::Type::Commit, 0, bars);
  }
}

juce::String LooperEditor::recordModeText(RecordMode mode) const {
  switch (mode) {
  case RecordMode::FirstLoop:
    return "First Loop";
  case RecordMode::FreeMode:
    return "Free Mode";
  case RecordMode::Traditional:
    return "Traditional";
  case RecordMode::Retrospective:
    return "Retrospective";
  default:
    return "Mode";
  }
}

juce::String LooperEditor::layerStateText(LooperLayer::State state,
                                          int lengthSamples) const {
  const float seconds =
      (float)lengthSamples / (float)juce::jmax(1.0, processor.getSampleRate());
  switch (state) {
  case LooperLayer::State::Empty:
    return "Empty";
  case LooperLayer::State::Playing:
    return "Playing " + juce::String(seconds, 2) + " s";
  case LooperLayer::State::Recording:
    return "Recording";
  case LooperLayer::State::Overdubbing:
    return "Overdubbing";
  case LooperLayer::State::Muted:
    return "Muted";
  case LooperLayer::State::Stopped:
    return "Stopped";
  default:
    return "Unknown";
  }
}

juce::Colour LooperEditor::layerStateColour(LooperLayer::State state) const {
  switch (state) {
  case LooperLayer::State::Empty:
    return juce::Colour(0xff64748b);
  case LooperLayer::State::Playing:
    return juce::Colour(0xff34d399);
  case LooperLayer::State::Recording:
    return juce::Colour(0xffef4444);
  case LooperLayer::State::Overdubbing:
    return juce::Colour(0xfff59e0b);
  case LooperLayer::State::Muted:
    return juce::Colour(0xff94a3b8);
  case LooperLayer::State::Stopped:
    return juce::Colour(0xfffde047);
  default:
    return juce::Colours::white;
  }
}

void LooperEditor::drawLayerWaveform(juce::Graphics &g,
                                     juce::Rectangle<int> bounds,
                                     const LooperLayer &layer,
                                     juce::Colour colour) const {
  const int length = layer.getLength();
  if (length <= 0 || bounds.getWidth() <= 0)
    return;

  const auto *raw = layer.getBuffer().getRawBuffer();
  if (raw == nullptr || raw->getNumSamples() <= 0)
    return;

  const int width = juce::jmax(1, bounds.getWidth());
  const int bucketSize = juce::jmax(1, length / width);
  const float centerY = (float)bounds.getCentreY();
  const float gain = (float)bounds.getHeight() * 0.43f;

  std::vector<float> peaks((size_t)width, 0.0f);
  float highest = 0.0f;

  for (int x = 0; x < width; ++x) {
    const int start = juce::jmin(length - 1, x * bucketSize);
    const int count = juce::jmin(bucketSize, length - start);
    float peak = 0.0f;

    for (int i = 0; i < count; ++i) {
      const int idx = start + i;
      const float l = std::abs(raw->getSample(0, idx));
      float r = l;
      if (raw->getNumChannels() > 1)
        r = std::abs(raw->getSample(1, idx));
      const float v = juce::jmax(l, r);
      if (v > peak)
        peak = v;
    }

    peaks[(size_t)x] = peak;
    if (peak > highest)
      highest = peak;
  }

  const float rescale =
      highest > 0.0f ? juce::jlimit(1.0f, 8.0f, 1.0f / highest) : 1.0f;

  g.setColour(colour.withAlpha(0.9f));
  for (int x = 0; x < width; ++x) {
    const float peak = juce::jmin(1.0f, peaks[(size_t)x] * rescale);
    const float h = peak * gain;
    g.drawVerticalLine(bounds.getX() + x, centerY - h, centerY + h);
  }
}

void LooperEditor::drawCaptureWindowWaveform(juce::Graphics &g,
                                             juce::Rectangle<int> bounds,
                                             int startSamplesAgo,
                                             int endSamplesAgo,
                                             juce::Colour colour) const {
  const auto &capture = processor.getCaptureBuffer();
  const int captureSize = capture.getSize();
  if (captureSize <= 0 || bounds.getWidth() <= 0)
    return;

  const int start = juce::jlimit(0, captureSize, startSamplesAgo);
  const int end = juce::jlimit(0, captureSize, endSamplesAgo);
  if (end <= start)
    return;

  const int viewSamples = end - start;
  const int width = juce::jmax(1, bounds.getWidth());
  const float centerY = (float)bounds.getCentreY();
  const float gain = (float)bounds.getHeight() * 0.45f;

  std::vector<float> peaks((size_t)width, 0.0f);
  float highest = 0.0f;

  const int bucketSize = juce::jmax(1, viewSamples / width);
  for (int x = 0; x < width; ++x) {
    const float t =
        width > 1 ? (float)(width - 1 - x) / (float)(width - 1) : 0.0f;
    const int firstAgo = start + (int)std::round(t * (float)(viewSamples - 1));
    if (firstAgo >= captureSize)
      continue;

    float peak = 0.0f;
    const int bucket = juce::jmin(bucketSize, captureSize - firstAgo);
    for (int i = 0; i < bucket; ++i) {
      const float sample = std::abs(capture.getSample(firstAgo + i, 0));
      if (sample > peak)
        peak = sample;
    }

    peaks[(size_t)x] = peak;
    if (peak > highest)
      highest = peak;
  }

  const float rescale =
      highest > 0.0f ? juce::jlimit(1.0f, 10.0f, 1.0f / highest) : 1.0f;

  g.setColour(colour);
  for (int x = 0; x < width; ++x) {
    float peak = peaks[(size_t)x] * rescale;
    if (peak > 1.0f)
      peak = 1.0f;

    const float h = peak * gain;
    g.drawVerticalLine(bounds.getX() + x, centerY - h, centerY + h);
  }
}
