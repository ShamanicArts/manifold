#pragma once

#include <string>
#include <unordered_map>
#include <vector>

namespace manifold::sources {

struct SourceParamSpec {
    std::string id;
    std::string name;
    std::string unit;
    float min = 0.0f;
    float max = 1.0f;
    float defaultValue = 0.0f;
    float step = 0.01f;
};

struct SourceSpec {
    std::string id;
    std::string name;
    std::string category;
    std::string description;
    std::vector<SourceParamSpec> params;
};

struct SourceDefinition {
    SourceSpec spec;
    std::string fragmentPreamble;
    std::string fragmentBody;
};

class TextureSourceRegistry {
public:
    static TextureSourceRegistry& instance();

    void registerBuiltinSources();
    bool loadSourceFromManifest(const std::string& manifestPath,
                                const std::string& fragmentPath,
                                bool builtin = false);

    std::vector<SourceSpec> listSources() const;
    const SourceSpec* findSource(const std::string& sourceId) const;
    std::string fragmentShaderFor(const std::string& sourceId) const;
    std::unordered_map<std::string, float> sanitizeParams(
        const std::string& sourceId,
        const std::unordered_map<std::string, float>& params) const;

private:
    TextureSourceRegistry() = default;
    ~TextureSourceRegistry() = default;

    const SourceDefinition* findDefinition(const std::string& sourceId) const;

    std::vector<SourceDefinition> builtinDefinitions_;
    std::vector<SourceDefinition> runtimeDefinitions_;
};

} // namespace manifold::sources
