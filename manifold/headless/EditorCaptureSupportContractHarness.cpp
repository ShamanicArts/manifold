#include "../core/EditorCaptureSupport.h"

#include "ContractHarnessUtils.h"

#include <juce_graphics/juce_graphics.h>

#include <algorithm>
#include <vector>

namespace {

using namespace contract_harness_utils;
using namespace editor_capture;

juce::String indentString(int indent) {
  juce::String out;
  for (int i = 0; i < indent; ++i) out += "  ";
  return out;
}

void appendCanonicalJson(const juce::var& value, juce::String& out, int indent) {
  if (auto* object = value.getDynamicObject()) {
    struct PropertyEntry { juce::String name; juce::var value; };
    std::vector<PropertyEntry> properties;
    const auto& namedValues = object->getProperties();
    properties.reserve(static_cast<std::size_t>(namedValues.size()));
    for (int i = 0; i < namedValues.size(); ++i) {
      properties.push_back({namedValues.getName(i).toString(), namedValues.getValueAt(i)});
    }
    std::sort(properties.begin(), properties.end(),
              [](const PropertyEntry& a, const PropertyEntry& b) { return a.name < b.name; });

    out += "{\n";
    for (std::size_t i = 0; i < properties.size(); ++i) {
      out += indentString(indent + 1);
      out += juce::JSON::toString(juce::var(properties[i].name), true);
      out += ": ";
      appendCanonicalJson(properties[i].value, out, indent + 1);
      if (i + 1 < properties.size()) out += ",";
      out += "\n";
    }
    out += indentString(indent);
    out += "}";
    return;
  }

  if (auto* array = value.getArray()) {
    out += "[";
    if (!array->isEmpty()) {
      out += "\n";
      for (int i = 0; i < array->size(); ++i) {
        out += indentString(indent + 1);
        appendCanonicalJson(array->getReference(i), out, indent + 1);
        if (i + 1 < array->size()) out += ",";
        out += "\n";
      }
      out += indentString(indent);
    }
    out += "]";
    return;
  }

  out += juce::JSON::toString(value, true);
}

juce::var rectToVar(const juce::Rectangle<int>& rect) {
  auto* obj = new juce::DynamicObject();
  obj->setProperty("x", rect.getX());
  obj->setProperty("y", rect.getY());
  obj->setProperty("w", rect.getWidth());
  obj->setProperty("h", rect.getHeight());
  return juce::var(obj);
}

juce::var colourToVar(juce::Colour colour) {
  auto* obj = new juce::DynamicObject();
  obj->setProperty("argb", juce::String::toHexString(static_cast<int>(colour.getARGB())));
  obj->setProperty("r", colour.getRed());
  obj->setProperty("g", colour.getGreen());
  obj->setProperty("b", colour.getBlue());
  obj->setProperty("a", colour.getAlpha());
  return juce::var(obj);
}

juce::Image makeTestImage() {
  juce::Image image(juce::Image::ARGB, 4, 3, true);
  image.setPixelAt(0, 0, juce::Colour(0xffff0000));
  image.setPixelAt(1, 0, juce::Colour(0xff00ff00));
  image.setPixelAt(2, 0, juce::Colour(0xff0000ff));
  image.setPixelAt(3, 0, juce::Colour(0xffffff00));
  image.setPixelAt(0, 1, juce::Colour(0xff00ffff));
  image.setPixelAt(1, 1, juce::Colour(0xffff00ff));
  image.setPixelAt(2, 1, juce::Colour(0xff112233));
  image.setPixelAt(3, 1, juce::Colour(0xff445566));
  image.setPixelAt(0, 2, juce::Colour(0xff778899));
  image.setPixelAt(1, 2, juce::Colour(0xffabcdef));
  image.setPixelAt(2, 2, juce::Colour(0xff135724));
  image.setPixelAt(3, 2, juce::Colour(0xff246813));
  return image;
}

juce::var buildFullContract() {
  auto* root = new juce::DynamicObject();
  root->setProperty("contractVersion", 1);

  {
    auto* obj = new juce::DynamicObject();
    const auto directPlan = buildScreenshotCapturePlan(true, 640, 480);
    obj->setProperty("directPrimary", static_cast<int>(directPlan.primarySource));
    obj->setProperty("directAllowFallback", directPlan.allowComponentFallback);
    obj->setProperty("directBounds", rectToVar(directPlan.componentSnapshotBounds));

    const auto componentPlan = buildScreenshotCapturePlan(false, 320, 200);
    obj->setProperty("componentPrimary", static_cast<int>(componentPlan.primarySource));
    obj->setProperty("componentAllowFallback", componentPlan.allowComponentFallback);
    obj->setProperty("componentBounds", rectToVar(componentPlan.componentSnapshotBounds));

    const auto nonePlan = buildScreenshotCapturePlan(false, 0, 200);
    obj->setProperty("nonePrimary", static_cast<int>(nonePlan.primarySource));
    obj->setProperty("noneAllowFallback", nonePlan.allowComponentFallback);
    obj->setProperty("noneBounds", rectToVar(nonePlan.componentSnapshotBounds));
    root->setProperty("screenshotPlan", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    const auto pngPath = juce::File::getSpecialLocation(juce::File::tempDirectory)
        .getChildFile("manifold_editor_capture_support_contract.png");
    pngPath.deleteFile();

    const auto testImage = makeTestImage();
    obj->setProperty("writeValid", writePng(testImage, pngPath.getFullPathName().toStdString()));
    obj->setProperty("writeInvalidImage", writePng(juce::Image(), pngPath.getFullPathName().toStdString()));
    obj->setProperty("writeEmptyPath", writePng(testImage, {}));
    obj->setProperty("fileExists", pngPath.existsAsFile());
    if (pngPath.existsAsFile()) {
      obj->setProperty("fileSizePositive", pngPath.getSize() > 0);
      auto decoded = juce::ImageFileFormat::loadFrom(pngPath);
      obj->setProperty("decodedValid", decoded.isValid());
      obj->setProperty("decodedWidth", decoded.getWidth());
      obj->setProperty("decodedHeight", decoded.getHeight());
      obj->setProperty("decodedPixel00", colourToVar(decoded.getPixelAt(0, 0)));
      pngPath.deleteFile();
    }
    root->setProperty("pngWrite", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    const juce::Rectangle<int> frameBounds(0, 0, 100, 80);

    RecordingOptions disabled;
    const auto disabledPlan = buildRecordingCropPlan(disabled, std::nullopt, frameBounds);
    obj->setProperty("disabledRequested", rectToVar(disabledPlan.requestedBounds));
    obj->setProperty("disabledEffective", rectToVar(disabledPlan.effectiveBounds));
    obj->setProperty("disabledApplied", disabledPlan.cropApplied);

    RecordingOptions explicitCrop;
    explicitCrop.cropEnabled = true;
    explicitCrop.cropX = 10;
    explicitCrop.cropY = 12;
    explicitCrop.cropW = 40;
    explicitCrop.cropH = 20;
    const auto explicitPlan = buildRecordingCropPlan(explicitCrop, std::nullopt, frameBounds);
    obj->setProperty("explicitRequested", rectToVar(explicitPlan.requestedBounds));
    obj->setProperty("explicitEffective", rectToVar(explicitPlan.effectiveBounds));
    obj->setProperty("explicitApplied", explicitPlan.cropApplied);
    obj->setProperty("explicitResolved", explicitPlan.usedResolvedNodeBounds);

    RecordingOptions clippedCrop = explicitCrop;
    clippedCrop.cropX = 80;
    clippedCrop.cropY = 70;
    clippedCrop.cropW = 50;
    clippedCrop.cropH = 30;
    const auto clippedPlan = buildRecordingCropPlan(clippedCrop, std::nullopt, frameBounds);
    obj->setProperty("clippedEffective", rectToVar(clippedPlan.effectiveBounds));
    obj->setProperty("clippedApplied", clippedPlan.cropApplied);

    RecordingOptions emptyCrop = explicitCrop;
    emptyCrop.cropX = 150;
    emptyCrop.cropY = 90;
    emptyCrop.cropW = 20;
    emptyCrop.cropH = 20;
    const auto emptyPlan = buildRecordingCropPlan(emptyCrop, std::nullopt, frameBounds);
    obj->setProperty("emptyRequested", rectToVar(emptyPlan.requestedBounds));
    obj->setProperty("emptyEffective", rectToVar(emptyPlan.effectiveBounds));
    obj->setProperty("emptyApplied", emptyPlan.cropApplied);

    RecordingOptions resolvedCrop = explicitCrop;
    resolvedCrop.cropNodeId = "foo";
    resolvedCrop.cropStableId = 42;
    const auto resolvedPlan = buildRecordingCropPlan(resolvedCrop, juce::Rectangle<int>(3, 4, 7, 8), frameBounds);
    obj->setProperty("resolvedRequested", rectToVar(resolvedPlan.requestedBounds));
    obj->setProperty("resolvedEffective", rectToVar(resolvedPlan.effectiveBounds));
    obj->setProperty("resolvedApplied", resolvedPlan.cropApplied);
    obj->setProperty("resolvedUsedNodeBounds", resolvedPlan.usedResolvedNodeBounds);

    root->setProperty("recordingCropPlan", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    const auto image = makeTestImage();

    RecordingCropPlan noCrop;
    noCrop.effectiveBounds = juce::Rectangle<int>(0, 0, image.getWidth(), image.getHeight());
    noCrop.cropApplied = false;
    const auto unchanged = applyRecordingCrop(image, noCrop);
    obj->setProperty("unchangedWidth", unchanged.getWidth());
    obj->setProperty("unchangedHeight", unchanged.getHeight());
    obj->setProperty("unchangedPixel", colourToVar(unchanged.getPixelAt(2, 1)));

    RecordingCropPlan cropped;
    cropped.cropApplied = true;
    cropped.effectiveBounds = juce::Rectangle<int>(1, 1, 2, 2);
    const auto clipped = applyRecordingCrop(image, cropped);
    obj->setProperty("croppedWidth", clipped.getWidth());
    obj->setProperty("croppedHeight", clipped.getHeight());
    obj->setProperty("croppedTopLeft", colourToVar(clipped.getPixelAt(0, 0)));
    obj->setProperty("croppedBottomRight", colourToVar(clipped.getPixelAt(1, 1)));

    root->setProperty("applyCrop", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    RecordingOptions ram;
    ram.streamFramesToDisk = false;
    obj->setProperty("ramSink", static_cast<int>(chooseRecordingFrameSink(ram, "/tmp/out")));

    RecordingOptions disk;
    disk.streamFramesToDisk = true;
    obj->setProperty("diskSink", static_cast<int>(chooseRecordingFrameSink(disk, "/tmp/out")));
    obj->setProperty("diskWithoutDirSink", static_cast<int>(chooseRecordingFrameSink(disk, {})));

    obj->setProperty("path1", juce::String(buildRecordingFramePath("/tmp/out", 1)));
    obj->setProperty("path42", juce::String(buildRecordingFramePath("/tmp/out", 42)));
    obj->setProperty("pathMissingDir", juce::String(buildRecordingFramePath({}, 42)));
    obj->setProperty("pathInvalidFrame", juce::String(buildRecordingFramePath("/tmp/out", 0)));

    root->setProperty("recordingSink", juce::var(obj));
  }

  return juce::var(root);
}

} // namespace

int main(int argc, char* argv[]) {
  HarnessOptions opts;
  if (!parseOptions(argc, argv, opts)) return 1;

  const juce::String contractJson = [&]() {
    juce::String out;
    appendCanonicalJson(buildFullContract(), out, 0);
    out += "\n";
    return out;
  }();

  return finishJsonContract(opts, "EditorCaptureSupport contract", contractJson.toStdString());
}
