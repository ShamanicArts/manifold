#include "Canvas.h"

#include <chrono>
#include <cstdio>
#include <cstring>

using namespace juce::gl;

namespace {
using Clock = std::chrono::steady_clock;

bool isInterestingCanvasName(const juce::String& name) {
    return name == "treeTabHierarchy"
        || name == "treeTabScripts"
        || name == "treePanel"
        || name == "treeCanvas"
        || name == "scriptCanvas"
        || name == "inspectorCanvas"
        || name == "mainTabBar"
        || name == "mainTabContent"
        || name == "script_content_root"
        || name == "editorPreviewOverlay";
}

double elapsedMs(Clock::time_point start) {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

void logCanvasInputEvent(const Canvas& canvas,
                         const char* eventName,
                         const juce::MouseEvent* mouseEvent,
                         double callbackMs,
                         double totalMs) {
    const auto& name = canvas.getName();
    const bool interesting = isInterestingCanvasName(name);
    const double thresholdMs = std::strcmp(eventName, "mouseMove") == 0 ? 8.0 : 2.0;
    if (!interesting && callbackMs < thresholdMs && totalMs < thresholdMs) {
        return;
    }

    const auto* parent = canvas.getParentComponent();
    const auto bounds = canvas.getBounds();
    const auto screenBounds = canvas.getScreenBounds();
    const auto pos = mouseEvent != nullptr ? mouseEvent->getPosition() : juce::Point<int>();
    const auto screenPos = mouseEvent != nullptr ? mouseEvent->getScreenPosition() : juce::Point<int>();
    const int clicks = mouseEvent != nullptr ? mouseEvent->getNumberOfClicks() : 0;
    const int dragged = mouseEvent != nullptr && mouseEvent->mouseWasDraggedSinceMouseDown() ? 1 : 0;
    const auto scale = juce::Component::getApproximateScaleFactorForComponent(&canvas);

    std::fprintf(stderr,
                 "[CanvasInput] %s name=%s parent=%s pos=%d,%d screen=%d,%d clicks=%d dragged=%d cb=%.3fms total=%.3fms showing=%d visible=%d bounds=%d,%d %dx%d screenBounds=%d,%d %dx%d scale=%.3f children=%d\n",
                 eventName,
                 name.toRawUTF8(),
                 parent != nullptr ? parent->getName().toRawUTF8() : "",
                 pos.x, pos.y,
                 screenPos.x, screenPos.y,
                 clicks,
                 dragged,
                 callbackMs,
                 totalMs,
                 canvas.isShowing() ? 1 : 0,
                 canvas.isVisible() ? 1 : 0,
                 bounds.getX(), bounds.getY(), bounds.getWidth(), bounds.getHeight(),
                 screenBounds.getX(), screenBounds.getY(), screenBounds.getWidth(), screenBounds.getHeight(),
                 static_cast<double>(scale),
                 canvas.getNumChildren());
}
}

// Static paint accumulation across all canvases
std::atomic<int64_t> Canvas::totalPaintAccumulatedUs{0};

Canvas::Canvas(const juce::String& name) 
    : juce::Component(name) 
{
}

Canvas::~Canvas() {
    setOpenGLEnabled(false);
}

void Canvas::setOpenGLEnabled(bool enabled) {
    if (enabled == openGLEnabled)
        return;
    
    openGLEnabled = enabled;
    
    if (enabled) {
        // Only create context if component is showing and has size
        if (isShowing() && getWidth() > 0 && getHeight() > 0) {
            glContext = std::make_unique<juce::OpenGLContext>();
            glContext->setRenderer(this);
            glContext->attachTo(*this);
        }
    } else {
        if (glContext) {
            glContext->detach();
            glContext.reset();
        }
    }
}

void Canvas::visibilityChanged() {
    // Auto-create OpenGL context when component becomes visible
    if (openGLEnabled && isShowing() && !glContext && getWidth() > 0 && getHeight() > 0) {
        glContext = std::make_unique<juce::OpenGLContext>();
        glContext->setRenderer(this);
        glContext->attachTo(*this);
    }
}

void Canvas::resized() {
    // Auto-create OpenGL context when component gets size
    if (openGLEnabled && isShowing() && !glContext && getWidth() > 0 && getHeight() > 0) {
        glContext = std::make_unique<juce::OpenGLContext>();
        glContext->setRenderer(this);
        glContext->attachTo(*this);
    }
}

void Canvas::parentHierarchyChanged() {
    // If this canvas was removed from its parent, disable OpenGL
    if (openGLEnabled && glContext && getParentComponent() == nullptr) {
        setOpenGLEnabled(false);
    }
}

void Canvas::paint(juce::Graphics& g) {
    const bool isRootCanvas = dynamic_cast<Canvas*>(getParentComponent()) == nullptr;
    const auto startTime = std::chrono::steady_clock::now();

    if (openGLEnabled) {
        const auto elapsedUs = std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::steady_clock::now() - startTime).count();
        lastPaintDurationUs.store(elapsedUs, std::memory_order_relaxed);
        totalPaintAccumulatedUs.fetch_add(elapsedUs, std::memory_order_relaxed);
        return;
    }

    if (style.opacity >= 0.001f) {
        auto bounds = getLocalBounds().toFloat();

        g.setColour(style.background.withMultipliedAlpha(style.opacity));
        if (style.cornerRadius > 0.001f)
            g.fillRoundedRectangle(bounds, style.cornerRadius);
        else
            g.fillRect(bounds);

        if (style.borderWidth > 0.001f) {
            g.setColour(style.border.withMultipliedAlpha(style.opacity));
            if (style.cornerRadius > 0.001f)
                g.drawRoundedRectangle(bounds, style.cornerRadius, style.borderWidth);
            else
                g.drawRect(bounds, static_cast<int>(style.borderWidth));
        }
    }

    if (onDraw) onDraw(*this, g);

    const auto elapsedUs = std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::steady_clock::now() - startTime).count();
    lastPaintDurationUs.store(elapsedUs, std::memory_order_relaxed);
    totalPaintAccumulatedUs.fetch_add(elapsedUs, std::memory_order_relaxed);
}

void Canvas::newOpenGLContextCreated() {
    if (onGLContextCreated)
        onGLContextCreated(*this);
}

void Canvas::renderOpenGL() {
    // Make sure we have a valid context
    if (!glContext || !glContext->isActive())
        return;
    
    // Set viewport
    auto bounds = getLocalBounds();
    if (bounds.getWidth() <= 0 || bounds.getHeight() <= 0)
        return;
    
    glViewport(0, 0, bounds.getWidth(), bounds.getHeight());
    
    // Clear to background color
    auto bg = style.background;
    glClearColor(bg.getFloatRed(), bg.getFloatGreen(), bg.getFloatBlue(), bg.getFloatAlpha());
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    
    // Call user render callback
    if (onGLRender)
        onGLRender(*this);
}

void Canvas::openGLContextClosing() {
    if (onGLContextClosing)
        onGLContextClosing(*this);
}

bool Canvas::hitTest(int x, int y) {
    const bool result = juce::Component::hitTest(x, y);
    if (isInterestingCanvasName(getName())) {
        bool interceptsSelf = false;
        bool interceptsChildren = false;
        getInterceptsMouseClicks(interceptsSelf, interceptsChildren);
        const auto screenBounds = getScreenBounds();
        const auto scale = juce::Component::getApproximateScaleFactorForComponent(this);
        std::fprintf(stderr,
                     "[CanvasHitTest] name=%s point=%d,%d result=%d interceptsSelf=%d interceptsChildren=%d visible=%d bounds=%d,%d %dx%d screenBounds=%d,%d %dx%d scale=%.3f\n",
                     getName().toRawUTF8(),
                     x,
                     y,
                     result ? 1 : 0,
                     interceptsSelf ? 1 : 0,
                     interceptsChildren ? 1 : 0,
                     isVisible() ? 1 : 0,
                     getBounds().getX(), getBounds().getY(), getBounds().getWidth(), getBounds().getHeight(),
                     screenBounds.getX(), screenBounds.getY(), screenBounds.getWidth(), screenBounds.getHeight(),
                     static_cast<double>(scale));
    }
    return result;
}

void Canvas::mouseDown(const juce::MouseEvent& e) {
    const auto totalStart = Clock::now();

    if (getWantsKeyboardFocus()) {
        grabKeyboardFocus();
    }

    double callbackMs = 0.0;
    if (onMouseDown) {
        const auto callbackStart = Clock::now();
        onMouseDown(e);
        callbackMs = elapsedMs(callbackStart);
    }

    logCanvasInputEvent(*this, "mouseDown", &e, callbackMs, elapsedMs(totalStart));
}

void Canvas::mouseDrag(const juce::MouseEvent& e) {
    if (!onMouseDrag) return;

    const auto totalStart = Clock::now();

    // Throttle to ~60Hz max (16ms interval) to prevent message thread saturation
    static thread_local auto lastDragTime = std::chrono::steady_clock::now();
    const auto now = std::chrono::steady_clock::now();
    const auto elapsed = std::chrono::duration_cast<std::chrono::microseconds>(now - lastDragTime).count();

    if (elapsed < 16000) {  // Skip if < 16ms since last drag
        return;
    }
    lastDragTime = now;

    const auto callbackStart = Clock::now();
    onMouseDrag(e);
    logCanvasInputEvent(*this, "mouseDrag", &e, elapsedMs(callbackStart), elapsedMs(totalStart));
}

void Canvas::mouseUp(const juce::MouseEvent& e) {
    const auto totalStart = Clock::now();

    if (e.getNumberOfClicks() >= 2 && onDoubleClick) {
        const auto callbackStart = Clock::now();
        onDoubleClick();
        logCanvasInputEvent(*this, "doubleClick", &e, elapsedMs(callbackStart), elapsedMs(totalStart));
    } else if (onClick && !e.mouseWasDraggedSinceMouseDown()) {
        const auto callbackStart = Clock::now();
        onClick();
        logCanvasInputEvent(*this, "click", &e, elapsedMs(callbackStart), elapsedMs(totalStart));
    }

    double callbackMs = 0.0;
    if (onMouseUp) {
        const auto callbackStart = Clock::now();
        onMouseUp(e);
        callbackMs = elapsedMs(callbackStart);
    }

    logCanvasInputEvent(*this, "mouseUp", &e, callbackMs, elapsedMs(totalStart));
}

void Canvas::mouseMove(const juce::MouseEvent& e) {
    const auto totalStart = Clock::now();

    double callbackMs = 0.0;
    if (onMouseMove) {
        const auto callbackStart = Clock::now();
        onMouseMove(e);
        callbackMs = elapsedMs(callbackStart);
    }

    if (onMouseMove || isInterestingCanvasName(getName())) {
        logCanvasInputEvent(*this, "mouseMove", &e, callbackMs, elapsedMs(totalStart));
    }
}

void Canvas::mouseEnter(const juce::MouseEvent& e) {
    const auto totalStart = Clock::now();

    double callbackMs = 0.0;
    if (onMouseEnter) {
        const auto callbackStart = Clock::now();
        onMouseEnter();
        callbackMs = elapsedMs(callbackStart);
    }

    logCanvasInputEvent(*this, "mouseEnter", &e, callbackMs, elapsedMs(totalStart));
}

void Canvas::mouseExit(const juce::MouseEvent& e) {
    const auto totalStart = Clock::now();

    double callbackMs = 0.0;
    if (onMouseExit) {
        const auto callbackStart = Clock::now();
        onMouseExit();
        callbackMs = elapsedMs(callbackStart);
    }

    logCanvasInputEvent(*this, "mouseExit", &e, callbackMs, elapsedMs(totalStart));
}

void Canvas::mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) {
    const auto totalStart = Clock::now();

    if (onMouseWheel) {
        const auto callbackStart = Clock::now();
        onMouseWheel(e, wheel);
        logCanvasInputEvent(*this, "mouseWheel", &e, elapsedMs(callbackStart), elapsedMs(totalStart));
    } else if (getParentComponent()) {
        getParentComponent()->mouseWheelMove(e, wheel);
        logCanvasInputEvent(*this, "mouseWheelBubble", &e, 0.0, elapsedMs(totalStart));
    }
}

bool Canvas::keyPressed(const juce::KeyPress& key) {
    if (onKeyPress) {
        return onKeyPress(key);
    }
    return juce::Component::keyPressed(key);
}

void Canvas::setStyle(const CanvasStyle& s) {
    style = s;
    repaint();
}

Canvas* Canvas::addChild(const juce::String& childName) {
    auto* child = new Canvas(childName);
    children.add(child);
    addAndMakeVisible(child);
    return child;
}

void Canvas::adoptChild(Canvas* child) {
    if (child == nullptr) return;
    
    // Remove from current parent's children array (but don't delete)
    if (auto* oldParent = dynamic_cast<Canvas*>(child->getParentComponent())) {
        oldParent->children.removeObject(child, false);  // false = don't delete
    }
    
    // Add to this canvas
    children.add(child);
    addAndMakeVisible(child);
}

void Canvas::removeChild(Canvas* child) {
    // Ensure OpenGL is disabled before removal to prevent rendering issues
    child->setOpenGLEnabled(false);
    removeChildComponent(child);
    children.removeObject(child);
}

void Canvas::clearChildren() {
    // Recursively disable OpenGL on ALL descendants (not just direct children)
    // This must happen before removeAllChildren() to prevent rendering issues
    std::function<void(Canvas*)> disableAllGL = [&](Canvas* canvas) {
        // First recurse into children (depth-first)
        for (int i = 0; i < canvas->getNumChildren(); ++i) {
            if (auto* childCanvas = dynamic_cast<Canvas*>(canvas->getChild(i))) {
                disableAllGL(childCanvas);
            }
        }
        // Then disable OpenGL on this canvas
        canvas->setOpenGLEnabled(false);
    };
    
    // Disable OpenGL on all descendants
    for (auto* child : children) {
        disableAllGL(child);
    }
    
    // Now safe to remove all children
    removeAllChildren();
    children.clear();
}

// ============================================================================
// User Data Storage
// ============================================================================

void Canvas::setUserData(const std::string& key, sol::object value) {
    userData_[key] = value;
}

sol::object Canvas::getUserData(const std::string& key) const {
    auto it = userData_.find(key);
    if (it != userData_.end()) {
        return it->second;
    }
    return sol::lua_nil;
}

bool Canvas::hasUserData(const std::string& key) const {
    return userData_.find(key) != userData_.end();
}

std::vector<std::string> Canvas::getUserDataKeys() const {
    std::vector<std::string> keys;
    keys.reserve(userData_.size());
    for (const auto& pair : userData_) {
        keys.push_back(pair.first);
    }
    return keys;
}

void Canvas::clearUserData(const std::string& key) {
    userData_.erase(key);
}

void Canvas::clearAllUserData() {
    userData_.clear();
}
