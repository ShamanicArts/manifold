#include "TextureSourceRegistry.h"

#include <juce_core/juce_core.h>

#include <algorithm>
#include <utility>

namespace manifold::sources {
namespace {

std::string fragmentPreambleFor(const SourceDefinition& definition) {
    std::string source = R"(#version 150
in vec2 vUv;
out vec4 fragColor;
uniform float uTime;
uniform vec2 uResolution;
uniform float uAspect;
)";

    for (const auto& param : definition.spec.params) {
        source += "uniform float " + param.id + ";\n";
    }

    if (!definition.fragmentPreamble.empty()) {
        source += definition.fragmentPreamble;
    }

    source += "\nvoid main() {\n";
    source += definition.fragmentBody;
    source += "\n}\n";
    return source;
}

} // namespace

TextureSourceRegistry& TextureSourceRegistry::instance() {
    static TextureSourceRegistry registry;
    registry.registerBuiltinSources();
    return registry;
}

void TextureSourceRegistry::registerBuiltinSources() {
    if (!builtinDefinitions_.empty()) {
        return;
    }

#ifdef MANIFOLD_SOURCE_DIR
    juce::File sourcesDir{juce::File{MANIFOLD_SOURCE_DIR}.getChildFile("manifold/sources/generator")};
#else
    juce::File sourcesDir{juce::File::getCurrentWorkingDirectory().getChildFile("manifold/sources/generator")};
#endif
    if (!sourcesDir.isDirectory()) {
        return;
    }

    auto jsonFiles = sourcesDir.findChildFiles(juce::File::findFiles, false, "*.json");
    for (const auto& jsonFile : jsonFiles) {
        auto glslFile = jsonFile.withFileExtension("glsl");
        if (glslFile.existsAsFile()) {
            loadSourceFromManifest(jsonFile.getFullPathName().toStdString(),
                                   glslFile.getFullPathName().toStdString(),
                                   true /* builtin */);
        }
    }
}

bool TextureSourceRegistry::loadSourceFromManifest(const std::string& manifestPath,
                                                   const std::string& fragmentPath,
                                                   bool builtin) {
    juce::File manifestFile{juce::String(manifestPath)};
    juce::File fragmentFile{juce::String(fragmentPath)};
    if (!manifestFile.existsAsFile() || !fragmentFile.existsAsFile()) {
        return false;
    }

    auto json = juce::JSON::parse(manifestFile);
    if (json.isVoid()) {
        return false;
    }

    SourceDefinition def;
    def.spec.id = json.getProperty("id", juce::var()).toString().toStdString();
    def.spec.name = json.getProperty("name", juce::var()).toString().toStdString();
    def.spec.category = json.getProperty("category", juce::var()).toString().toStdString();
    def.spec.description = json.getProperty("description", juce::var()).toString().toStdString();

    auto paramsVar = json.getProperty("params", juce::var());
    if (paramsVar.isArray()) {
        auto* paramsArray = paramsVar.getArray();
        for (const auto& paramVar : *paramsArray) {
            SourceParamSpec param;
            param.id = paramVar.getProperty("id", juce::var()).toString().toStdString();
            param.name = paramVar.getProperty("name", juce::var()).toString().toStdString();
            param.unit = paramVar.getProperty("unit", juce::var()).toString().toStdString();
            param.min = static_cast<float>(paramVar.getProperty("min", juce::var(0.0)));
            param.max = static_cast<float>(paramVar.getProperty("max", juce::var(1.0)));
            param.defaultValue = static_cast<float>(paramVar.getProperty("default", juce::var(0.5)));
            param.step = static_cast<float>(paramVar.getProperty("step", juce::var(0.01)));
            def.spec.params.push_back(std::move(param));
        }
    }

    def.fragmentPreamble = json.getProperty("preamble", juce::var()).toString().toStdString();
    def.fragmentBody = fragmentFile.loadFileAsString().toStdString();

    auto& targetList = builtin ? builtinDefinitions_ : runtimeDefinitions_;
    auto it = std::find_if(targetList.begin(), targetList.end(),
        [&](const auto& entry) { return entry.spec.id == def.spec.id; });
    if (it != targetList.end()) {
        *it = std::move(def);
    } else {
        targetList.push_back(std::move(def));
    }
    return true;
}

std::vector<SourceSpec> TextureSourceRegistry::listSources() const {
    std::vector<SourceSpec> specs;
    specs.reserve(builtinDefinitions_.size() + runtimeDefinitions_.size());
    for (const auto& definition : builtinDefinitions_) {
        specs.push_back(definition.spec);
    }
    for (const auto& definition : runtimeDefinitions_) {
        specs.push_back(definition.spec);
    }
    return specs;
}

const SourceSpec* TextureSourceRegistry::findSource(const std::string& sourceId) const {
    auto it = std::find_if(builtinDefinitions_.begin(), builtinDefinitions_.end(),
        [&](const auto& def) { return def.spec.id == sourceId; });
    if (it != builtinDefinitions_.end()) {
        return &it->spec;
    }
    it = std::find_if(runtimeDefinitions_.begin(), runtimeDefinitions_.end(),
        [&](const auto& def) { return def.spec.id == sourceId; });
    if (it != runtimeDefinitions_.end()) {
        return &it->spec;
    }
    return nullptr;
}

const SourceDefinition* TextureSourceRegistry::findDefinition(const std::string& sourceId) const {
    auto it = std::find_if(builtinDefinitions_.begin(), builtinDefinitions_.end(),
        [&](const auto& def) { return def.spec.id == sourceId; });
    if (it != builtinDefinitions_.end()) {
        return &(*it);
    }
    it = std::find_if(runtimeDefinitions_.begin(), runtimeDefinitions_.end(),
        [&](const auto& def) { return def.spec.id == sourceId; });
    if (it != runtimeDefinitions_.end()) {
        return &(*it);
    }
    return nullptr;
}

std::string TextureSourceRegistry::fragmentShaderFor(const std::string& sourceId) const {
    const auto* definition = findDefinition(sourceId);
    if (definition != nullptr) {
        return fragmentPreambleFor(*definition);
    }
    return std::string{};
}

std::unordered_map<std::string, float> TextureSourceRegistry::sanitizeParams(
    const std::string& sourceId,
    const std::unordered_map<std::string, float>& params) const {
    std::unordered_map<std::string, float> values;
    const auto* source = findSource(sourceId);
    if (source == nullptr) {
        return values;
    }

    for (const auto& param : source->params) {
        values[param.id] = param.defaultValue;
    }
    for (const auto& param : source->params) {
        const auto found = params.find(param.id);
        if (found == params.end()) {
            continue;
        }
        values[param.id] = std::clamp(found->second, param.min, param.max);
    }
    return values;
}

} // namespace manifold::sources
