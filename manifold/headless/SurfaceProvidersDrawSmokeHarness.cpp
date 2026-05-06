#include "../primitives/shaders/ShaderEffectRegistry.h"
#include "../primitives/ui/RuntimeNode.h"
#include "../ui/imgui/ImGuiDirectHost.h"
#include "../ui/imgui/DirectHostRuntimeSupport.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>
#include <juce_graphics/juce_graphics.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_opengl/juce_opengl.h>

#include <algorithm>
#include <memory>
#include <vector>

namespace {

using namespace contract_harness_utils;

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

juce::var makeObject() {
  return juce::var(new juce::DynamicObject());
}

juce::DynamicObject* asObject(juce::var& value) {
  return value.getDynamicObject();
}

juce::var makeRect(const juce::Rectangle<int>& rect) {
  auto obj = makeObject();
  asObject(obj)->setProperty("x", rect.getX());
  asObject(obj)->setProperty("y", rect.getY());
  asObject(obj)->setProperty("w", rect.getWidth());
  asObject(obj)->setProperty("h", rect.getHeight());
  return obj;
}

juce::var makeColour(juce::Colour colour) {
  auto obj = makeObject();
  asObject(obj)->setProperty("argb", juce::String::toHexString(static_cast<int>(colour.getARGB())));
  asObject(obj)->setProperty("r", colour.getRed());
  asObject(obj)->setProperty("g", colour.getGreen());
  asObject(obj)->setProperty("b", colour.getBlue());
  asObject(obj)->setProperty("a", colour.getAlpha());
  return obj;
}

std::string solidFragmentShader(float r, float g, float b, float a = 1.0f) {
  return "#version 150\n"
         "in vec2 vUv;\n"
         "out vec4 fragColor;\n"
         "uniform float uTime;\n"
         "uniform vec2 uResolution;\n"
         "uniform float uAspect;\n"
         "void main() {\n"
         "    fragColor = vec4(" + std::to_string(r) + ", " + std::to_string(g) + ", " + std::to_string(b) + ", " + std::to_string(a) + ");\n"
         "}\n";
}

std::string greenFromBluePassShader() {
  return R"(#version 150
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uInputTex;
uniform sampler2D uPrevTex;
uniform float uTime;
uniform vec2 uResolution;
uniform float uAspect;
void main() {
    vec4 src = texture(uInputTex, vUv);
    fragColor = vec4(0.0, src.b, 0.0, 1.0);
}
)";
}

juce::var makeGeneratedSourcePayload(juce::Colour colour) {
  auto payload = makeObject();
  const auto vertex = manifold::shaders::ShaderEffectRegistry::instance().vertexShader();
  asObject(payload)->setProperty("vertexShader", juce::String(vertex));
  asObject(payload)->setProperty("fragmentShader", juce::String(solidFragmentShader(colour.getFloatRed(),
                                                                                   colour.getFloatGreen(),
                                                                                   colour.getFloatBlue(),
                                                                                   colour.getFloatAlpha())));
  asObject(payload)->setProperty("uniforms", makeObject());
  return payload;
}

juce::var makeShaderSurfacePayload() {
  auto payload = makeObject();
  const auto vertex = manifold::shaders::ShaderEffectRegistry::instance().vertexShader();

  asObject(payload)->setProperty("version", 2);
  asObject(payload)->setProperty("kind", "shaderQuad");
  asObject(payload)->setProperty("sourceType", "generated_source");
  asObject(payload)->setProperty("fitMode", "contain");

  auto sourceShader = makeObject();
  asObject(sourceShader)->setProperty("vertexShader", juce::String(vertex));
  asObject(sourceShader)->setProperty("fragmentShader", juce::String(solidFragmentShader(0.0f, 0.0f, 1.0f, 1.0f)));
  asObject(sourceShader)->setProperty("uniforms", makeObject());
  asObject(payload)->setProperty("sourceShader", sourceShader);

  juce::var passes;
  passes.resize(0);
  auto pass = makeObject();
  asObject(pass)->setProperty("vertexShader", juce::String(vertex));
  asObject(pass)->setProperty("fragmentShader", juce::String(greenFromBluePassShader()));
  asObject(pass)->setProperty("inputTextureUniform", "uInputTex");
  asObject(pass)->setProperty("prevTextureUniform", "uPrevTex");
  asObject(pass)->setProperty("chain", true);
  asObject(pass)->setProperty("uniforms", makeObject());
  if (auto* arr = passes.getArray()) {
    arr->add(pass);
  }
  asObject(payload)->setProperty("passes", passes);

  return payload;
}

juce::var makeCompositePayload(const std::string& bottomNodeId,
                               const std::string& topNodeId,
                               float opacity) {
  auto payload = makeObject();
  asObject(payload)->setProperty("version", 1);
  asObject(payload)->setProperty("kind", "compositeQuad");
  asObject(payload)->setProperty("fitMode", "contain");
  asObject(payload)->setProperty("bottomNodeId", juce::String(bottomNodeId));
  asObject(payload)->setProperty("topNodeId", juce::String(topNodeId));
  asObject(payload)->setProperty("blendOpId", "normal");
  asObject(payload)->setProperty("opacity", opacity);
  asObject(payload)->setProperty("blendParams", makeObject());
  return payload;
}

void configureSurfaceNode(RuntimeNode& node,
                          const std::string& nodeId,
                          const juce::Rectangle<int>& bounds,
                          const std::string& surfaceType,
                          const juce::var& payload) {
  node.setNodeId(nodeId);
  node.setBounds(bounds.getX(), bounds.getY(), bounds.getWidth(), bounds.getHeight());
  RuntimeNode::StyleState style;
  style.background = 0x00000000u;
  style.border = 0xffffffffu;
  style.borderWidth = 1.0f;
  node.setStyle(style);
  node.setCustomSurfaceType(surfaceType);
  node.setCustomRenderPayload(payload);
}

juce::var surfaceInfoToVar(ImGuiDirectHost& host, uint64_t stableId) {
  auto obj = makeObject();
  int width = 0;
  int height = 0;
  uint64_t sequence = 0;
  const bool ok = host.getVideoSurfaceInfo(stableId, width, height, sequence);
  asObject(obj)->setProperty("ok", ok);
  asObject(obj)->setProperty("width", width);
  asObject(obj)->setProperty("height", height);
  asObject(obj)->setProperty("sequence", static_cast<juce::int64>(sequence));
  return obj;
}

juce::var samplePoint(const juce::Image& image, juce::Point<int> point) {
  auto obj = makeObject();
  const bool inBounds = image.isValid()
      && point.x >= 0 && point.y >= 0
      && point.x < image.getWidth() && point.y < image.getHeight();
  asObject(obj)->setProperty("inBounds", inBounds);
  if (inBounds) {
    asObject(obj)->setProperty("color", makeColour(image.getPixelAt(point.x, point.y)));
  }
  return obj;
}

juce::var buildFullContract() {
  RuntimeNode root("surface_root");
  root.setNodeId("surface_root");
  root.setBounds(0, 0, 320, 120);
  RuntimeNode::StyleState rootStyle;
  rootStyle.background = 0xff101010u;
  root.setStyle(rootStyle);

  auto generatedPayload = makeGeneratedSourcePayload(juce::Colour(0xffff0000));
  auto shaderPayload = makeShaderSurfacePayload();
  auto compositePayload = makeCompositePayload("generated_node", "shader_node", 0.5f);

  auto* generatedNode = root.createChild("GeneratedNode");
  configureSurfaceNode(*generatedNode, "generated_node", {16, 20, 80, 80}, "generated_source", generatedPayload);

  auto* shaderNode = root.createChild("ShaderNode");
  configureSurfaceNode(*shaderNode, "shader_node", {120, 20, 80, 80}, "gpu_shader", shaderPayload);

  auto* compositeNode = root.createChild("CompositeNode");
  configureSurfaceNode(*compositeNode, "composite_node", {224, 20, 80, 80}, "gpu_composite", compositePayload);

  auto host = std::make_unique<ImGuiDirectHost>();
  host->setBounds(0, 0, 320, 120);
  host->setVisible(true);
  host->setRootNode(&root);
  host->buildRenderSnapshot();

  auto* rootComponent = host.get();
  juce::ignoreUnused(rootComponent);

  auto* contract = new juce::DynamicObject();
  contract->setProperty("eglReady", host->ensureEglOffscreenContext(320, 120));

  auto screenshot = host->captureScreenshot();
  contract->setProperty("generatedHandle",
                        static_cast<juce::int64>(host->prepareCustomSurfaceTextureImmediate(*generatedNode, 80, 80, 0.0)));
  contract->setProperty("shaderHandle",
                        static_cast<juce::int64>(host->prepareCustomSurfaceTextureImmediate(*shaderNode, 80, 80, 0.0)));
  contract->setProperty("compositeHandle",
                        static_cast<juce::int64>(host->prepareCustomSurfaceTextureImmediate(*compositeNode, 80, 80, 0.0)));
  auto screenshotObj = makeObject();
  asObject(screenshotObj)->setProperty("valid", screenshot.isValid());
  asObject(screenshotObj)->setProperty("width", screenshot.getWidth());
  asObject(screenshotObj)->setProperty("height", screenshot.getHeight());
  asObject(screenshotObj)->setProperty("generatedCenter", samplePoint(screenshot, {56, 60}));
  asObject(screenshotObj)->setProperty("shaderCenter", samplePoint(screenshot, {160, 60}));
  asObject(screenshotObj)->setProperty("compositeCenter", samplePoint(screenshot, {264, 60}));
  asObject(screenshotObj)->setProperty("backgroundCorner", samplePoint(screenshot, {4, 4}));
  contract->setProperty("screenshot", screenshotObj);

  auto boundsObj = makeObject();
  const auto generatedBounds = host->getRenderedNodeBounds("generated_node", generatedNode->getStableId());
  const auto shaderBounds = host->getRenderedNodeBounds("shader_node", shaderNode->getStableId());
  const auto compositeBounds = host->getRenderedNodeBounds("composite_node", compositeNode->getStableId());
  boundsObj.getDynamicObject()->setProperty("generated", generatedBounds ? makeRect(*generatedBounds) : juce::var("<none>"));
  boundsObj.getDynamicObject()->setProperty("shader", shaderBounds ? makeRect(*shaderBounds) : juce::var("<none>"));
  boundsObj.getDynamicObject()->setProperty("composite", compositeBounds ? makeRect(*compositeBounds) : juce::var("<none>"));
  contract->setProperty("renderedBounds", boundsObj);

  auto infoObj = makeObject();
  infoObj.getDynamicObject()->setProperty("generated", surfaceInfoToVar(*host, generatedNode->getStableId()));
  infoObj.getDynamicObject()->setProperty("shader", surfaceInfoToVar(*host, shaderNode->getStableId()));
  infoObj.getDynamicObject()->setProperty("composite", surfaceInfoToVar(*host, compositeNode->getStableId()));
  contract->setProperty("surfaceInfo", infoObj);

  const auto stats = host->getStatsSnapshot();
  auto statsObj = makeObject();
  statsObj.getDynamicObject()->setProperty("contextReady", stats.contextReady);
  statsObj.getDynamicObject()->setProperty("frameCount", static_cast<juce::int64>(stats.frameCount));
  statsObj.getDynamicObject()->setProperty("surfaceColorBytes", static_cast<juce::int64>(stats.surfaceColorBytes));
  statsObj.getDynamicObject()->setProperty("surfaceDepthBytes", static_cast<juce::int64>(stats.surfaceDepthBytes));
  statsObj.getDynamicObject()->setProperty("totalGpuBytes", static_cast<juce::int64>(stats.totalGpuBytes));
  statsObj.getDynamicObject()->setProperty("lastRenderUsPositive", stats.lastRenderUs > 0);
  contract->setProperty("stats", statsObj);

  host->shutdown();
  contract->setProperty("postShutdownReadbackValid", host->readbackFramebuffer().isValid());

  return juce::var(contract);
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

  return finishJsonContract(opts, "SurfaceProvidersDrawSmoke contract", contractJson.toStdString());
}
