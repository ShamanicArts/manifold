#include "ControlContractHarnessSupport.h"

#include <poll.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <optional>
#include <string>

#include <juce_core/juce_core.h>

namespace {

using namespace control_contract_support;

int connectUnixSocket(const std::string& path) {
    const int fd = ::socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0) {
        return -1;
    }

    sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    std::strncpy(addr.sun_path, path.c_str(), sizeof(addr.sun_path) - 1);

    if (::connect(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        ::close(fd);
        return -1;
    }
    return fd;
}

bool sendAll(int fd, const std::string& text) {
    size_t sent = 0;
    while (sent < text.size()) {
        const ssize_t wrote = ::send(fd, text.data() + sent, text.size() - sent, MSG_NOSIGNAL);
        if (wrote <= 0) {
            return false;
        }
        sent += static_cast<size_t>(wrote);
    }
    return true;
}

std::optional<std::string> readLine(int fd, int timeoutMs = 2000) {
    std::string line;
    char ch = '\0';
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeoutMs);

    while (std::chrono::steady_clock::now() < deadline) {
        pollfd pfd{};
        pfd.fd = fd;
        pfd.events = POLLIN;

        const int waitMs = static_cast<int>(std::chrono::duration_cast<std::chrono::milliseconds>(
            deadline - std::chrono::steady_clock::now()).count());
        const int ready = ::poll(&pfd, 1, std::max(1, waitMs));
        if (ready <= 0) {
            continue;
        }
        if ((pfd.revents & (POLLERR | POLLHUP)) != 0) {
            return std::nullopt;
        }
        const ssize_t got = ::read(fd, &ch, 1);
        if (got <= 0) {
            return std::nullopt;
        }
        if (ch == '\n') {
            return line;
        }
        line.push_back(ch);
    }

    return std::nullopt;
}

std::optional<std::string> roundTrip(const std::string& socketPath,
                                     const std::string& command,
                                     int timeoutMs = 2000) {
    const int fd = connectUnixSocket(socketPath);
    if (fd < 0) {
        return std::nullopt;
    }

    const bool sent = sendAll(fd, command + "\n");
    const auto line = sent ? readLine(fd, timeoutMs) : std::nullopt;
    ::close(fd);
    return line;
}

juce::var parseResponseJson(const std::string& response) {
    if (response.rfind("OK ", 0) != 0) {
        return {};
    }
    return juce::JSON::parse(response.substr(3));
}

juce::var setCallToVar(const MockControlProcessor::SetCall& call) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("path", juce::String(call.path));
    obj->setProperty("value", call.value);
    return juce::var(obj);
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    juce::ScopedJuceInitialiser_GUI juceInit;
    MockControlProcessor processor;
    processor.getOSCQueryServer().setContext(&processor, &processor.getEndpointRegistry());
    processor.getControlServer().start(&processor);

    auto stopServer = juce::ScopeGuard{[&processor]() {
        processor.getControlServer().stop();
    }};

    const std::string socketPath = processor.getControlServer().getSocketPath();
    const bool serverReady = waitUntil([&socketPath]() {
        return juce::File(socketPath).exists();
    }, 2000, 10);

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // =====================================================================
    // Domain 1: startup and basic socket flow
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("serverReady", serverReady);
        obj->setProperty("socketExists", juce::File(socketPath).exists());
        obj->setProperty("socketPatternOk",
                         juce::String(socketPath).startsWith("/tmp/manifold_") &&
                         juce::String(socketPath).endsWith(".sock"));
        obj->setProperty("ping", juce::String(roundTrip(socketPath, "PING").value_or("<connect failed>")));
        root->setProperty("startup", juce::var(obj));
    }

    // =====================================================================
    // Domain 2: query surfaces through the real IPC socket
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();

        const auto stateResponse = roundTrip(socketPath, "GET /core/behavior/state").value_or("");
        const auto stateVar = parseResponseJson(stateResponse);
        auto* stateSummary = new juce::DynamicObject();
        stateSummary->setProperty("responsePrefixOk", stateResponse.rfind("OK ", 0) == 0);
        stateSummary->setProperty("projectionVersion", stateVar.getProperty("VALUE", juce::var()).getProperty("projectionVersion", -1));
        const auto params = stateVar.getProperty("VALUE", juce::var()).getProperty("params", juce::var());
        if (auto* paramsObj = params.getDynamicObject()) {
            stateSummary->setProperty("tempo", paramsObj->getProperty("/core/behavior/tempo"));
            stateSummary->setProperty("activeLayer", paramsObj->getProperty("/core/behavior/layer"));
            stateSummary->setProperty("layer2State", paramsObj->getProperty("/core/behavior/layer/2/state"));
        }
        stateSummary->setProperty("uiRendererMode", stateVar.getProperty("VALUE", juce::var()).getProperty("uiRendererMode", juce::var()));
        obj->setProperty("state", juce::var(stateSummary));

        const auto tempoResponse = roundTrip(socketPath, "GET /core/behavior/tempo").value_or("");
        const auto tempoVar = parseResponseJson(tempoResponse);
        obj->setProperty("tempoGetResponse", juce::String(tempoResponse));
        obj->setProperty("tempoValue", tempoVar.getProperty("VALUE", juce::var()));

        const auto customResponse = roundTrip(socketPath, "GET /custom/fader").value_or("");
        const auto customVar = parseResponseJson(customResponse);
        obj->setProperty("customGetResponse", juce::String(customResponse));
        obj->setProperty("customValue", customVar.getProperty("VALUE", juce::var()));

        const auto diagnosticsResponse = roundTrip(socketPath, "GET /core/behavior/diagnostics").value_or("");
        const auto diagnosticsVar = parseResponseJson(diagnosticsResponse);
        auto* diagnosticsSummary = new juce::DynamicObject();
        diagnosticsSummary->setProperty("responsePrefixOk", diagnosticsResponse.rfind("OK ", 0) == 0);
        diagnosticsSummary->setProperty("commandsProcessed",
                                        diagnosticsVar.getProperty("VALUE", juce::var()).getProperty("commandsProcessed", -1));
        diagnosticsSummary->setProperty("uiRendererMode",
                                        diagnosticsVar.getProperty("VALUE", juce::var()).getProperty("uiRendererMode", juce::var()));
        obj->setProperty("diagnostics", juce::var(diagnosticsSummary));

        root->setProperty("queryFlow", juce::var(obj));
    }

    // =====================================================================
    // Domain 3: command dispatch and direct-write behavior
    // =====================================================================
    {
        processor.clearHistories();
        auto* obj = new juce::DynamicObject();

        const auto setCustomResponse = roundTrip(socketPath, "SET /custom/fader 0.75").value_or("");
        const auto setHistory = processor.getSetHistory();
        obj->setProperty("setCustomResponse", juce::String(setCustomResponse));
        obj->setProperty("setCustomHistorySize", static_cast<int>(setHistory.size()));
        if (!setHistory.empty()) {
            obj->setProperty("lastSet", setCallToVar(setHistory.back()));
        }

        const auto setTempoResponse = roundTrip(socketPath, "SET /core/behavior/tempo 132.5").value_or("");
        const auto triggerResponse = roundTrip(socketPath, "TRIGGER /core/behavior/rec").value_or("");
        obj->setProperty("setTempoResponse", juce::String(setTempoResponse));
        obj->setProperty("triggerResponse", juce::String(triggerResponse));

        std::vector<ControlCommand> queuedCommands;
        ControlCommand queued;
        while (processor.getControlServer().getCommandQueue().dequeue(queued)) {
            queuedCommands.push_back(queued);
        }
        obj->setProperty("commandQueueSize", static_cast<int>(queuedCommands.size()));
        if (queuedCommands.size() >= 2) {
            obj->setProperty("tempoCommand", controlCommandToVar(queuedCommands[0]));
            obj->setProperty("triggerCommand", controlCommandToVar(queuedCommands[1]));
        }

        const auto readOnlyResponse = roundTrip(socketPath, "SET /core/behavior/recording 1").value_or("");
        const auto legacyResponse = roundTrip(socketPath, "TEMPO 127").value_or("");
        obj->setProperty("readOnlyRejected", juce::String(readOnlyResponse).startsWith("ERROR"));
        obj->setProperty("legacyRejected", juce::String(legacyResponse).startsWith("ERROR"));
        obj->setProperty("readOnlyResponse", juce::String(readOnlyResponse));
        obj->setProperty("legacyResponse", juce::String(legacyResponse));

        root->setProperty("commandDispatch", juce::var(obj));
    }

    // =====================================================================
    // Domain 4: watcher mode and event streaming
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        const int watcherFd = connectUnixSocket(socketPath);
        obj->setProperty("watcherConnected", watcherFd >= 0);

        if (watcherFd >= 0) {
            sendAll(watcherFd, "WATCH\n");
            const auto watchAck = readLine(watcherFd, 2000).value_or("<no ack>");
            obj->setProperty("watchAck", juce::String(watchAck));

            const auto watcherSeen = waitUntil([&processor]() {
                const auto diagnostics = juce::JSON::parse(processor.getControlServer().getDiagnosticsJson());
                return static_cast<int>(diagnostics.getProperty("connectedWatchers", 0)) == 1;
            }, 2000, 10);
            obj->setProperty("diagnosticsSeesWatcher", watcherSeen);

            static constexpr const char* kEventPayload = R"({"type":"contract","value":7})";
            processor.getControlServer().pushEvent(kEventPayload,
                                                   static_cast<int>(std::strlen(kEventPayload)));
            obj->setProperty("eventLine", juce::String(readLine(watcherFd, 2000).value_or("<no event>")));

            ::close(watcherFd);
            waitUntil([&processor]() {
                const auto diagnostics = juce::JSON::parse(processor.getControlServer().getDiagnosticsJson());
                return static_cast<int>(diagnostics.getProperty("connectedWatchers", 0)) == 0;
            }, 2000, 10);
        }

        root->setProperty("watchFlow", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();

    switch (opts.mode) {
        case HarnessOptions::Write: {
            std::ofstream file(opts.contractPath);
            if (!file.is_open()) {
                std::fprintf(stderr, "ERROR: cannot write to %s\n", opts.contractPath.c_str());
                return 2;
            }
            file << contract;
            std::fprintf(stdout,
                         "OK: wrote ControlServer contract (%zu bytes) to %s\n",
                         contract.size(),
                         opts.contractPath.c_str());
            return 0;
        }
        case HarnessOptions::Verify:
            return verifyJsonContract("ControlServer contract", contract, opts.contractPath) ? 0 : 3;
        case HarnessOptions::Print:
        default:
            std::fprintf(stdout, "%s\n", contract.c_str());
            return 0;
    }
}
