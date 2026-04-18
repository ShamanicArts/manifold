juce_add_console_app(ManifoldTestNodesApp
    PRODUCT_NAME "Manifold Test Nodes")

target_sources(ManifoldTestNodesApp
    PRIVATE
        ${PROJECT_SOURCE_DIR}/dsp_simd_test/TestNodesApp/main.cpp
        ${PROJECT_SOURCE_DIR}/dsp/core/nodes/ADSREnvelopeNode.cpp
        ${PROJECT_SOURCE_DIR}/dsp/core/nodes/BitCrusherNode.cpp
        ${PROJECT_SOURCE_DIR}/dsp/core/nodes/MixerNode.cpp
        ${PROJECT_SOURCE_DIR}/dsp/core/nodes/FilterNode.cpp
        ${PROJECT_SOURCE_DIR}/dsp/core/nodes/OscillatorNode.cpp
        ${PROJECT_SOURCE_DIR}/dsp/core/nodes/GainNode.cpp)

# Need project root in include path for includes like "dsp/core/..."
target_include_directories(ManifoldTestNodesApp
    PRIVATE
        ${PROJECT_SOURCE_DIR})

manifold_target_include_project_and_ableton(ManifoldTestNodesApp)

target_compile_definitions(ManifoldTestNodesApp
    PRIVATE
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0)

target_link_libraries(ManifoldTestNodesApp
    PRIVATE
        juce::juce_audio_basics
        highway
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags)