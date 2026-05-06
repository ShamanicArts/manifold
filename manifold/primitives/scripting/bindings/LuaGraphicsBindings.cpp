#include "LuaGraphicsBindings.h"

#include "LuaUIBindingHelpers.h"

#include <tuple>
#include <utility>

namespace lua_bindings {
using namespace lua_ui_helpers;

void registerGraphicsBindings(sol::state& lua) {
    auto gfx = lua.create_named_table("gfx");

    gfx["setColour"] = [](uint32_t argb) {
        if (currentRuntimeDrawRecorder != nullptr) {
            currentRuntimeDrawRecorder->state.color = argb;
        }
        if (currentGraphics)
            currentGraphics->setColour(juce::Colour(argb));
    };

    gfx["setFont"] = sol::overload(
        [](float size) {
            if (currentRuntimeDrawRecorder != nullptr) {
                currentRuntimeDrawRecorder->state.fontSize = size;
            }
            if (currentGraphics)
                currentGraphics->setFont(juce::Font(juce::FontOptions(size)));
        },
        [](const std::string& name, float size) {
            if (currentRuntimeDrawRecorder != nullptr) {
                currentRuntimeDrawRecorder->state.fontSize = size;
            }
            if (currentGraphics)
                currentGraphics->setFont(juce::Font(juce::FontOptions(juce::String(name), size, juce::Font::plain)));
        },
        [](const std::string& name, float size, int flags) {
            if (currentRuntimeDrawRecorder != nullptr) {
                currentRuntimeDrawRecorder->state.fontSize = size;
            }
            if (currentGraphics)
                currentGraphics->setFont(juce::Font(juce::FontOptions(juce::String(name), size, flags)));
        }
    );

    gfx["save"] = []() {
        if (currentRuntimeDrawRecorder != nullptr) {
            currentRuntimeDrawRecorder->stateStack.push_back(currentRuntimeDrawRecorder->state);
            pushRecordedCommand(makeDisplayListCommand("save"));
        }
        if (currentGraphics)
            currentGraphics->saveState();
    };

    gfx["restore"] = []() {
        if (currentRuntimeDrawRecorder != nullptr) {
            if (!currentRuntimeDrawRecorder->stateStack.empty()) {
                currentRuntimeDrawRecorder->state = currentRuntimeDrawRecorder->stateStack.back();
                currentRuntimeDrawRecorder->stateStack.pop_back();
            }
            pushRecordedCommand(makeDisplayListCommand("restore"));
        }
        if (currentGraphics)
            currentGraphics->restoreState();
    };

    gfx["clipRect"] = [](int x, int y, int w, int h) {
        if (currentRuntimeDrawRecorder != nullptr) {
            auto cmd = makeDisplayListCommand("clipRect");
            cmd->setProperty("x", x);
            cmd->setProperty("y", y);
            cmd->setProperty("w", w);
            cmd->setProperty("h", h);
            pushRecordedCommand(std::move(cmd));
        }
        if (currentGraphics)
            currentGraphics->reduceClipRegion(juce::Rectangle<int>(x, y, w, h));
    };

    gfx["addTransform"] = [](float a, float b, float c, float d, float tx, float ty) {
        if (currentGraphics)
            currentGraphics->addTransform(juce::AffineTransform(a, b, tx, c, d, ty));
    };

    gfx["drawText"] = [](const std::string& text, int x, int y, int w, int h,
                         sol::optional<int> justification) {
        const int just = justification.value_or(36);
        if (currentRuntimeDrawRecorder != nullptr) {
            auto cmd = makeDisplayListCommand("drawText");
            cmd->setProperty("x", x);
            cmd->setProperty("y", y);
            cmd->setProperty("w", w);
            cmd->setProperty("h", h);
            cmd->setProperty("text", juce::String(text));
            const auto [align, valign] = justificationToAlign(just);
            cmd->setProperty("align", juce::String(align));
            cmd->setProperty("valign", juce::String(valign));
            applyRecordedDrawState(*cmd);
            pushRecordedCommand(std::move(cmd));
        }
        if (currentGraphics) {
            currentGraphics->drawText(juce::String(text),
                                      juce::Rectangle<int>(x, y, w, h),
                                      juce::Justification(just));
        }
    };

    gfx["fillRect"] = [](float x, float y, float w, float h) {
        if (currentRuntimeDrawRecorder != nullptr) {
            auto cmd = makeDisplayListCommand("fillRect");
            cmd->setProperty("x", x);
            cmd->setProperty("y", y);
            cmd->setProperty("w", w);
            cmd->setProperty("h", h);
            applyRecordedDrawState(*cmd);
            pushRecordedCommand(std::move(cmd));
        }
        if (currentGraphics)
            currentGraphics->fillRect(x, y, w, h);
    };

    gfx["fillRoundedRect"] = [](float x, float y, float w, float h, float radius) {
        if (currentRuntimeDrawRecorder != nullptr) {
            auto cmd = makeDisplayListCommand("fillRoundedRect");
            cmd->setProperty("x", x);
            cmd->setProperty("y", y);
            cmd->setProperty("w", w);
            cmd->setProperty("h", h);
            cmd->setProperty("radius", radius);
            applyRecordedDrawState(*cmd);
            pushRecordedCommand(std::move(cmd));
        }
        if (currentGraphics)
            currentGraphics->fillRoundedRectangle(x, y, w, h, radius);
    };

    gfx["drawRoundedRect"] = [](float x, float y, float w, float h,
                                float radius, float lineThickness) {
        if (currentRuntimeDrawRecorder != nullptr) {
            auto cmd = makeDisplayListCommand("drawRoundedRect");
            cmd->setProperty("x", x);
            cmd->setProperty("y", y);
            cmd->setProperty("w", w);
            cmd->setProperty("h", h);
            cmd->setProperty("radius", radius);
            cmd->setProperty("thickness", lineThickness);
            applyRecordedDrawState(*cmd);
            pushRecordedCommand(std::move(cmd));
        }
        if (currentGraphics)
            currentGraphics->drawRoundedRectangle(x, y, w, h, radius, lineThickness);
    };

    gfx["drawRect"] = sol::overload(
        [](int x, int y, int w, int h) {
            if (currentRuntimeDrawRecorder != nullptr) {
                auto cmd = makeDisplayListCommand("drawRect");
                cmd->setProperty("x", x);
                cmd->setProperty("y", y);
                cmd->setProperty("w", w);
                cmd->setProperty("h", h);
                cmd->setProperty("thickness", 1);
                applyRecordedDrawState(*cmd);
                pushRecordedCommand(std::move(cmd));
            }
            if (currentGraphics)
                currentGraphics->drawRect(x, y, w, h);
        },
        [](int x, int y, int w, int h, int lineThickness) {
            if (currentRuntimeDrawRecorder != nullptr) {
                auto cmd = makeDisplayListCommand("drawRect");
                cmd->setProperty("x", x);
                cmd->setProperty("y", y);
                cmd->setProperty("w", w);
                cmd->setProperty("h", h);
                cmd->setProperty("thickness", lineThickness);
                applyRecordedDrawState(*cmd);
                pushRecordedCommand(std::move(cmd));
            }
            if (currentGraphics)
                currentGraphics->drawRect(x, y, w, h, lineThickness);
        }
    );

    gfx["drawVerticalLine"] = [](int x, float top, float bottom) {
        if (currentRuntimeDrawRecorder != nullptr) {
            auto cmd = makeDisplayListCommand("drawLine");
            cmd->setProperty("x1", x);
            cmd->setProperty("y1", top);
            cmd->setProperty("x2", x);
            cmd->setProperty("y2", bottom);
            cmd->setProperty("thickness", 1.0);
            applyRecordedDrawState(*cmd);
            pushRecordedCommand(std::move(cmd));
        }
        if (currentGraphics)
            currentGraphics->drawVerticalLine(x, top, bottom);
    };

    gfx["drawHorizontalLine"] = [](int y, float left, float right) {
        if (currentRuntimeDrawRecorder != nullptr) {
            auto cmd = makeDisplayListCommand("drawLine");
            cmd->setProperty("x1", left);
            cmd->setProperty("y1", y);
            cmd->setProperty("x2", right);
            cmd->setProperty("y2", y);
            cmd->setProperty("thickness", 1.0);
            applyRecordedDrawState(*cmd);
            pushRecordedCommand(std::move(cmd));
        }
        if (currentGraphics)
            currentGraphics->drawHorizontalLine(y, left, right);
    };

    gfx["fillAll"] = []() {
        if (currentRuntimeDrawRecorder != nullptr && currentRuntimeDrawRecorder->node != nullptr) {
            const auto& bounds = currentRuntimeDrawRecorder->node->getBounds();
            auto cmd = makeDisplayListCommand("fillRect");
            cmd->setProperty("x", 0);
            cmd->setProperty("y", 0);
            cmd->setProperty("w", bounds.w);
            cmd->setProperty("h", bounds.h);
            applyRecordedDrawState(*cmd);
            pushRecordedCommand(std::move(cmd));
        }
        if (currentGraphics)
            currentGraphics->fillAll();
    };

    gfx["drawLine"] = sol::overload(
        [](float x1, float y1, float x2, float y2) {
            if (currentRuntimeDrawRecorder != nullptr) {
                auto cmd = makeDisplayListCommand("drawLine");
                cmd->setProperty("x1", x1);
                cmd->setProperty("y1", y1);
                cmd->setProperty("x2", x2);
                cmd->setProperty("y2", y2);
                cmd->setProperty("thickness", 1.0);
                applyRecordedDrawState(*cmd);
                pushRecordedCommand(std::move(cmd));
            }
            if (currentGraphics)
                currentGraphics->drawLine(x1, y1, x2, y2);
        },
        [](float x1, float y1, float x2, float y2, float lineThickness) {
            if (currentRuntimeDrawRecorder != nullptr) {
                auto cmd = makeDisplayListCommand("drawLine");
                cmd->setProperty("x1", x1);
                cmd->setProperty("y1", y1);
                cmd->setProperty("x2", x2);
                cmd->setProperty("y2", y2);
                cmd->setProperty("thickness", lineThickness);
                applyRecordedDrawState(*cmd);
                pushRecordedCommand(std::move(cmd));
            }
            if (currentGraphics)
                currentGraphics->drawLine(x1, y1, x2, y2, lineThickness);
        }
    );
}

} // namespace lua_bindings
