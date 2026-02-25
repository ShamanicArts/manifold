#include "../primitives/control/ControlServer.h"

#include <cmath>
#include <cstdio>

namespace {

bool nearlyEqual(double left, double right, double epsilon = 0.0001) {
  return std::abs(left - right) <= epsilon;
}

double getNumberProperty(const juce::var &objectVar, const juce::Identifier &key,
                         double fallback = 0.0) {
  if (auto *object = objectVar.getDynamicObject()) {
    const juce::var value = object->getProperty(key);
    if (value.isInt() || value.isInt64() || value.isDouble() || value.isBool()) {
      return static_cast<double>(value);
    }
  }

  return fallback;
}

juce::String getStringProperty(const juce::var &objectVar,
                               const juce::Identifier &key,
                               const juce::String &fallback = {}) {
  if (auto *object = objectVar.getDynamicObject()) {
    const juce::var value = object->getProperty(key);
    if (value.isString()) {
      return value.toString();
    }
  }

  return fallback;
}

} // namespace

int main() {
  ControlServer server;
  auto &state = server.getAtomicState();

  state.tempo.store(133.5f);
  state.samplesPerBar.store(88200.0f);
  state.masterVolume.store(0.73f);
  state.activeLayer.store(2);
  state.recordMode.store(1);
  state.isRecording.store(true);
  state.overdubEnabled.store(false);

  for (int index = 0; index < AtomicState::MAX_LAYERS; ++index) {
    auto &layer = state.layers[index];
    layer.length.store(1000 * (index + 1));
    layer.playheadPos.store(100 * (index + 1));
    layer.speed.store(0.5f + static_cast<float>(index));
    layer.volume.store(0.25f + static_cast<float>(index) * 0.1f);
    layer.reversed.store((index % 2) == 1);
    layer.numBars.store(0.5f * static_cast<float>(index + 1));
    layer.state.store(index % 7);
  }

  const juce::String stateJson(server.getStateJson());
  const juce::var parsed = juce::JSON::parse(stateJson);
  if (parsed.isVoid()) {
    std::fprintf(stderr, "StateProjectionHarness: FAIL: state JSON did not parse\n");
    return 2;
  }

  int checks = 0;
  auto check = [&](bool condition, const char *message) {
    ++checks;
    if (!condition) {
      std::fprintf(stderr, "StateProjectionHarness: FAIL: %s\n", message);
      std::exit(3);
    }
  };

  check(getNumberProperty(parsed, "projectionVersion") == 1.0,
        "projectionVersion is 1");
  check(getNumberProperty(parsed, "numVoices") == AtomicState::MAX_LAYERS,
        "numVoices matches layer count");

  const auto *rootObject = parsed.getDynamicObject();
  check(rootObject != nullptr, "root object exists");

  const juce::var paramsVar = rootObject->getProperty("params");
  const juce::var layersVar = rootObject->getProperty("layers");
  const juce::var voicesVar = rootObject->getProperty("voices");
  const auto *paramsObject = paramsVar.getDynamicObject();
  auto *layersArray = layersVar.getArray();
  auto *voicesArray = voicesVar.getArray();

  check(paramsObject != nullptr, "params object exists");
  check(layersArray != nullptr, "layers array exists");
  check(voicesArray != nullptr, "voices array exists");
  check(static_cast<int>(layersArray->size()) == AtomicState::MAX_LAYERS,
        "layers array has expected entries");
  check(static_cast<int>(voicesArray->size()) == AtomicState::MAX_LAYERS,
        "voices array has expected entries");

  check(nearlyEqual(getNumberProperty(parsed, "tempo"),
                    static_cast<double>(paramsObject->getProperty("/looper/tempo"))),
        "top-level tempo matches params tempo");
  check(nearlyEqual(getNumberProperty(parsed, "samplesPerBar"),
                    static_cast<double>(paramsObject->getProperty("/looper/samplesPerBar"))),
        "top-level samplesPerBar matches params samplesPerBar");
  check(getNumberProperty(parsed, "captureSize") ==
            static_cast<double>(paramsObject->getProperty("/looper/captureSize")),
        "top-level captureSize matches params captureSize");
  check(getNumberProperty(parsed, "isRecording") ==
            static_cast<double>(paramsObject->getProperty("/looper/recording")),
        "top-level isRecording matches params recording");
  check(getNumberProperty(parsed, "overdubEnabled") ==
            static_cast<double>(paramsObject->getProperty("/looper/overdub")),
        "top-level overdubEnabled matches params overdub");
  check(getStringProperty(parsed, "recordMode") ==
            paramsObject->getProperty("/looper/mode").toString(),
        "top-level recordMode matches params mode");
  check(nearlyEqual(getNumberProperty(parsed, "masterVolume"),
                    static_cast<double>(paramsObject->getProperty("/looper/volume"))),
        "top-level masterVolume matches params volume");
  check(getNumberProperty(parsed, "activeLayer") ==
            static_cast<double>(paramsObject->getProperty("/looper/layer")),
        "top-level activeLayer matches params layer");

  for (int index = 0; index < AtomicState::MAX_LAYERS; ++index) {
    const juce::var &layerVar = (*layersArray)[index];
    const juce::var &voiceVar = (*voicesArray)[index];

    const juce::String prefix = "/looper/layer/" + juce::String(index);
    const juce::Identifier volumeKey(prefix + "/volume");
    const juce::Identifier reverseKey(prefix + "/reverse");
    const juce::Identifier lengthKey(prefix + "/length");
    const juce::Identifier positionKey(prefix + "/position");
    const juce::Identifier barsKey(prefix + "/bars");
    const juce::Identifier speedKey(prefix + "/speed");
    const juce::Identifier stateKey(prefix + "/state");

    const double legacyLength = getNumberProperty(layerVar, "length");
    const double legacyPosition = getNumberProperty(layerVar, "playheadPos");
    const double legacySpeed = getNumberProperty(layerVar, "speed");
    const double legacyVolume = getNumberProperty(layerVar, "volume");
    const double legacyReverse = getNumberProperty(layerVar, "reversed");
    const double legacyBars = getNumberProperty(layerVar, "numBars");
    const juce::String legacyState = getStringProperty(layerVar, "state");

    const double expectedPositionNorm =
        (legacyLength > 0.0) ? (legacyPosition / legacyLength) : 0.0;

    check(getNumberProperty(layerVar, "index") == index,
          "legacy layer index matches slot");
    check(getNumberProperty(voiceVar, "id") == index,
          "voice id matches slot");
    check(getStringProperty(voiceVar, "path") == prefix,
          "voice path matches layer prefix");

    check(nearlyEqual(legacySpeed, getNumberProperty(voiceVar, "speed")),
          "voice speed matches layer speed");
    check(nearlyEqual(legacySpeed,
                      static_cast<double>(paramsObject->getProperty(speedKey))),
          "params speed matches layer speed");
    check(nearlyEqual(legacyVolume, getNumberProperty(voiceVar, "volume")),
          "voice volume matches layer volume");
    check(nearlyEqual(legacyVolume,
                      static_cast<double>(paramsObject->getProperty(volumeKey))),
          "params volume matches layer volume");
    check(legacyReverse == getNumberProperty(voiceVar, "reversed"),
          "voice reversed matches layer reversed");
    check(legacyReverse == static_cast<double>(paramsObject->getProperty(reverseKey)),
          "params reverse matches layer reversed");
    check(nearlyEqual(legacyLength, getNumberProperty(voiceVar, "length")),
          "voice length matches layer length");
    check(nearlyEqual(legacyLength,
                      static_cast<double>(paramsObject->getProperty(lengthKey))),
          "params length matches layer length");
    check(nearlyEqual(legacyPosition, getNumberProperty(voiceVar, "position")),
          "voice position matches layer playheadPos");
    check(nearlyEqual(expectedPositionNorm, getNumberProperty(voiceVar, "positionNorm")),
          "voice positionNorm matches normalized layer position");
    check(nearlyEqual(expectedPositionNorm,
                      static_cast<double>(paramsObject->getProperty(positionKey))),
          "params position matches normalized layer position");
    check(nearlyEqual(legacyBars, getNumberProperty(voiceVar, "bars")),
          "voice bars matches layer numBars");
    check(nearlyEqual(legacyBars,
                      static_cast<double>(paramsObject->getProperty(barsKey))),
          "params bars matches layer numBars");

    check(legacyState == getStringProperty(voiceVar, "state"),
          "voice state matches layer state");
    check(legacyState == paramsObject->getProperty(stateKey).toString(),
          "params state matches layer state");
  }

  std::fprintf(stdout, "StateProjectionHarness: PASS (%d checks)\n", checks);
  return 0;
}
