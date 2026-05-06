#include "ControlContractHarnessSupport.h"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <array>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <optional>
#include <string>
#include <vector>

#include <juce_core/juce_core.h>

namespace {

using namespace control_contract_support;

struct HttpResponse {
    int statusCode = 0;
    std::string body;
};

int connectTcp(int port) {
    const int fd = ::socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        return -1;
    }

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(static_cast<uint16_t>(port));
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

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

std::string readAll(int fd, int timeoutMs = 2000) {
    std::string out;
    char buffer[4096];
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeoutMs);

    while (std::chrono::steady_clock::now() < deadline) {
        pollfd pfd{};
        pfd.fd = fd;
        pfd.events = POLLIN;
        const int waitMs = static_cast<int>(std::chrono::duration_cast<std::chrono::milliseconds>(
            deadline - std::chrono::steady_clock::now()).count());
        const int ready = ::poll(&pfd, 1, std::max(1, waitMs));
        if (ready < 0) {
            break;
        }
        if (ready == 0) {
            continue;
        }
        const ssize_t got = ::read(fd, buffer, sizeof(buffer));
        if (got <= 0) {
            break;
        }
        out.append(buffer, static_cast<size_t>(got));
    }

    return out;
}

HttpResponse httpRequest(int port,
                         const std::string& method,
                         const std::string& path,
                         const std::string& body = std::string()) {
    HttpResponse response;
    const int fd = connectTcp(port);
    if (fd < 0) {
        return response;
    }

    std::string request = method + " " + path + " HTTP/1.1\r\n";
    request += "Host: 127.0.0.1\r\n";
    request += "Connection: close\r\n";
    if (!body.empty()) {
        request += "Content-Type: text/plain\r\n";
        request += "Content-Length: " + std::to_string(body.size()) + "\r\n";
    }
    request += "\r\n";
    request += body;

    sendAll(fd, request);
    const std::string raw = readAll(fd);
    ::close(fd);

    const auto lineEnd = raw.find("\r\n");
    if (lineEnd == std::string::npos) {
        return response;
    }

    const std::string statusLine = raw.substr(0, lineEnd);
    const auto firstSpace = statusLine.find(' ');
    if (firstSpace != std::string::npos) {
        response.statusCode = std::atoi(statusLine.c_str() + firstSpace + 1);
    }

    const auto headerEnd = raw.find("\r\n\r\n");
    if (headerEnd != std::string::npos) {
        response.body = raw.substr(headerEnd + 4);
    }

    return response;
}

bool sendMaskedTextFrame(int fd, const std::string& payload) {
    std::vector<uint8_t> frame;
    frame.reserve(payload.size() + 16);
    frame.push_back(0x81);

    const size_t length = payload.size();
    if (length < 126) {
        frame.push_back(static_cast<uint8_t>(0x80 | length));
    } else if (length < 65536) {
        frame.push_back(0x80 | 126);
        frame.push_back(static_cast<uint8_t>((length >> 8) & 0xFF));
        frame.push_back(static_cast<uint8_t>(length & 0xFF));
    } else {
        return false;
    }

    const std::array<uint8_t, 4> mask = {0x12, 0x34, 0x56, 0x78};
    frame.insert(frame.end(), mask.begin(), mask.end());
    for (size_t i = 0; i < length; ++i) {
        frame.push_back(static_cast<uint8_t>(payload[i]) ^ mask[i % 4]);
    }

    return sendAll(fd, std::string(reinterpret_cast<const char*>(frame.data()), frame.size()));
}

bool readExact(int fd, void* dest, size_t size, int timeoutMs = 2000) {
    uint8_t* out = static_cast<uint8_t*>(dest);
    size_t offset = 0;
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeoutMs);

    while (offset < size && std::chrono::steady_clock::now() < deadline) {
        pollfd pfd{};
        pfd.fd = fd;
        pfd.events = POLLIN;
        const int ready = ::poll(&pfd, 1, 50);
        if (ready <= 0) {
            continue;
        }
        const ssize_t got = ::read(fd, out + offset, size - offset);
        if (got <= 0) {
            return false;
        }
        offset += static_cast<size_t>(got);
    }

    return offset == size;
}

struct WsFrame {
    uint8_t opcode = 0;
    std::vector<uint8_t> payload;
};

std::optional<WsFrame> readWsFrame(int fd, int timeoutMs = 2500) {
    uint8_t header[2]{};
    if (!readExact(fd, header, sizeof(header), timeoutMs)) {
        return std::nullopt;
    }

    WsFrame frame;
    frame.opcode = static_cast<uint8_t>(header[0] & 0x0F);
    uint64_t length = static_cast<uint64_t>(header[1] & 0x7F);
    const bool masked = (header[1] & 0x80) != 0;

    if (length == 126) {
        uint8_t ext[2]{};
        if (!readExact(fd, ext, sizeof(ext), timeoutMs)) {
            return std::nullopt;
        }
        length = (static_cast<uint64_t>(ext[0]) << 8) | ext[1];
    } else if (length == 127) {
        return std::nullopt;
    }

    uint8_t mask[4]{};
    if (masked) {
        if (!readExact(fd, mask, sizeof(mask), timeoutMs)) {
            return std::nullopt;
        }
    }

    frame.payload.resize(static_cast<size_t>(length));
    if (length > 0 && !readExact(fd, frame.payload.data(), frame.payload.size(), timeoutMs)) {
        return std::nullopt;
    }

    if (masked) {
        for (size_t i = 0; i < frame.payload.size(); ++i) {
            frame.payload[i] ^= mask[i % 4];
        }
    }

    return frame;
}

struct OscPacket {
    juce::String address;
    juce::String typeTags;
    juce::var firstValue;
};

std::optional<OscPacket> parseOscPacket(const std::vector<uint8_t>& bytes) {
    if (bytes.size() < 8) {
        return std::nullopt;
    }

    int offset = 0;
    OscPacket out;
    while (offset < static_cast<int>(bytes.size()) && bytes[static_cast<size_t>(offset)] != '\0') {
        out.address += static_cast<char>(bytes[static_cast<size_t>(offset++)]);
    }
    ++offset;
    while ((offset % 4) != 0) {
        ++offset;
    }
    if (offset >= static_cast<int>(bytes.size()) || bytes[static_cast<size_t>(offset)] != ',') {
        return std::nullopt;
    }
    ++offset;
    while (offset < static_cast<int>(bytes.size()) && bytes[static_cast<size_t>(offset)] != '\0') {
        out.typeTags += static_cast<char>(bytes[static_cast<size_t>(offset++)]);
    }
    ++offset;
    while ((offset % 4) != 0) {
        ++offset;
    }
    if (out.typeTags.isEmpty()) {
        return out;
    }

    const char tag = out.typeTags[0];
    if (tag == 'f' && offset + 4 <= static_cast<int>(bytes.size())) {
        uint32_t beVal = 0;
        std::memcpy(&beVal, bytes.data() + offset, 4);
        beVal = ntohl(beVal);
        float value = 0.0f;
        std::memcpy(&value, &beVal, 4);
        out.firstValue = value;
    } else if (tag == 'i' && offset + 4 <= static_cast<int>(bytes.size())) {
        uint32_t beVal = 0;
        std::memcpy(&beVal, bytes.data() + offset, 4);
        out.firstValue = static_cast<int>(ntohl(beVal));
    } else if (tag == 's') {
        juce::String value;
        while (offset < static_cast<int>(bytes.size()) && bytes[static_cast<size_t>(offset)] != '\0') {
            value += static_cast<char>(bytes[static_cast<size_t>(offset++)]);
        }
        out.firstValue = value;
    }

    return out;
}

juce::var makeResponseSummary(const HttpResponse& response) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("statusCode", response.statusCode);
    obj->setProperty("body", juce::String(response.body));
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
    processor.getOSCServer().setCustomValue("/custom/xy", {juce::var(0.1), juce::var(0.8)});
    processor.getControlServer().start(&processor);

    const int httpPort = findFreeTcpPort();
    const int oscPort = findFreeUdpPort();
    if (httpPort <= 0 || oscPort <= 0) {
        std::fprintf(stderr, "ERROR: failed to allocate ports\n");
        return 2;
    }

    processor.getOSCQueryServer().start(&processor, &processor.getEndpointRegistry(), httpPort, oscPort);
    auto stopServer = juce::ScopeGuard{[&processor]() {
        processor.getOSCQueryServer().stop();
        processor.getControlServer().stop();
    }};

    const bool serverReady = waitUntil([httpPort]() {
        return httpRequest(httpPort, "GET", "/info").statusCode == 200;
    }, 2500, 25);

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // =====================================================================
    // Domain 1: HTTP metadata surfaces
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("serverReady", serverReady);

        const auto info = httpRequest(httpPort, "GET", "/info");
        const auto infoJson = juce::JSON::parse(info.body);
        obj->setProperty("info", makeResponseSummary(info));
        obj->setProperty("rootFullPath", infoJson.getProperty("FULL_PATH", juce::var()));

        auto* tempoMeta = new juce::DynamicObject();
        const auto tempoNode = infoJson.getProperty("CONTENTS", juce::var())
                                  .getProperty("core", juce::var())
                                  .getProperty("CONTENTS", juce::var())
                                  .getProperty("behavior", juce::var())
                                  .getProperty("CONTENTS", juce::var())
                                  .getProperty("tempo", juce::var());
        tempoMeta->setProperty("type", tempoNode.getProperty("TYPE", juce::var()));
        tempoMeta->setProperty("access", tempoNode.getProperty("ACCESS", -1));
        tempoMeta->setProperty("description", tempoNode.getProperty("DESCRIPTION", juce::var()));
        tempoMeta->setProperty("rangeMin", tempoNode.getProperty("RANGE", juce::var())[0].getProperty("MIN", juce::var()));
        tempoMeta->setProperty("rangeMax", tempoNode.getProperty("RANGE", juce::var())[0].getProperty("MAX", juce::var()));
        obj->setProperty("tempoMeta", juce::var(tempoMeta));

        auto* customMeta = new juce::DynamicObject();
        const auto customFaderNode = infoJson.getProperty("CONTENTS", juce::var())
                                       .getProperty("CONTENTS", juce::var());
        juce::ignoreUnused(customFaderNode);
        const auto customNode = infoJson.getProperty("CONTENTS", juce::var())
                                  .getProperty("custom", juce::var())
                                  .getProperty("CONTENTS", juce::var())
                                  .getProperty("fader", juce::var());
        customMeta->setProperty("type", customNode.getProperty("TYPE", juce::var()));
        customMeta->setProperty("description", customNode.getProperty("DESCRIPTION", juce::var()));
        obj->setProperty("customFaderMeta", juce::var(customMeta));

        const auto hostInfo = httpRequest(httpPort, "GET", "/?HOST_INFO");
        const auto hostInfoJson = juce::JSON::parse(hostInfo.body);
        auto* hostSummary = new juce::DynamicObject();
        hostSummary->setProperty("statusCode", hostInfo.statusCode);
        hostSummary->setProperty("name", hostInfoJson.getProperty("NAME", juce::var()));
        hostSummary->setProperty("oscTransport", hostInfoJson.getProperty("OSC_TRANSPORT", juce::var()));
        hostSummary->setProperty("hasValueExtension", hostInfoJson.getProperty("EXTENSIONS", juce::var()).getProperty("VALUE", false));
        hostSummary->setProperty("oscPortPositive", static_cast<int>(hostInfoJson.getProperty("OSC_PORT", 0)) > 0);
        hostSummary->setProperty("wsPortPositive", static_cast<int>(hostInfoJson.getProperty("WS_PORT", 0)) > 0);
        obj->setProperty("hostInfo", juce::var(hostSummary));

        root->setProperty("metadataHttp", juce::var(obj));
    }

    // =====================================================================
    // Domain 2: VALUE queries and HTTP command endpoints
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();

        const auto tempoValue = httpRequest(httpPort, "GET", "/osc/core/behavior/tempo");
        const auto tempoJson = juce::JSON::parse(tempoValue.body);
        obj->setProperty("tempoValue", tempoJson.getProperty("VALUE", juce::var()));

        const auto directPathValue = httpRequest(httpPort, "GET", "/custom/fader");
        const auto directPathJson = juce::JSON::parse(directPathValue.body);
        obj->setProperty("customFaderValue", directPathJson.getProperty("VALUE", juce::var()));

        const auto xyValue = httpRequest(httpPort, "GET", "/custom/xy");
        obj->setProperty("customXyValue", juce::JSON::parse(xyValue.body).getProperty("VALUE", juce::var()));

        const auto missing = httpRequest(httpPort, "GET", "/does/not/exist");
        obj->setProperty("missingStatus", missing.statusCode);
        obj->setProperty("missingBody", juce::String(missing.body));

        const auto listTargets = httpRequest(httpPort, "POST", "/api/targets");
        const auto addTarget = httpRequest(httpPort, "POST", "/api/targets", "add:127.0.0.1:9901");
        const auto listTargetsAfterAdd = httpRequest(httpPort, "POST", "/api/targets");
        const auto removeTarget = httpRequest(httpPort, "POST", "/api/targets", "remove:127.0.0.1:9901");
        obj->setProperty("targetsInitial", makeResponseSummary(listTargets));
        obj->setProperty("targetsAdd", makeResponseSummary(addTarget));
        obj->setProperty("targetsAfterAdd", makeResponseSummary(listTargetsAfterAdd));
        obj->setProperty("targetsRemove", makeResponseSummary(removeTarget));

        const auto commandOk = httpRequest(httpPort, "POST", "/api/command", "SET /custom/fader 0.5");
        const auto commandBad = httpRequest(httpPort, "POST", "/api/command", "GET /core/behavior/tempo");
        obj->setProperty("commandOk", makeResponseSummary(commandOk));
        obj->setProperty("commandBad", makeResponseSummary(commandBad));
        const auto setHistory = processor.getSetHistory();
        obj->setProperty("setHistorySize", static_cast<int>(setHistory.size()));
        if (!setHistory.empty()) {
            auto* lastSet = new juce::DynamicObject();
            lastSet->setProperty("path", juce::String(setHistory.back().path));
            lastSet->setProperty("value", setHistory.back().value);
            obj->setProperty("lastSet", juce::var(lastSet));
        }

        root->setProperty("valueAndCommandHttp", juce::var(obj));
    }

    // =====================================================================
    // Domain 3: WebSocket LISTEN value streaming
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        const int wsFd = connectTcp(httpPort);
        obj->setProperty("connected", wsFd >= 0);

        if (wsFd >= 0) {
            const std::string request =
                "GET / HTTP/1.1\r\n"
                "Host: 127.0.0.1\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                "Sec-WebSocket-Version: 13\r\n"
                "Sec-WebSocket-Protocol: oscquery\r\n"
                "\r\n";
            sendAll(wsFd, request);
            const std::string handshake = readAll(wsFd, 500);
            obj->setProperty("handshake101", handshake.find("101 Switching Protocols") != std::string::npos);

            sendMaskedTextFrame(wsFd, R"({"COMMAND":"LISTEN","DATA":"/core/behavior/tempo"})");
            const auto firstFrame = readWsFrame(wsFd, 2500);
            if (firstFrame.has_value()) {
                obj->setProperty("firstOpcode", static_cast<int>(firstFrame->opcode));
                const auto packet = parseOscPacket(firstFrame->payload);
                if (packet.has_value()) {
                    auto* firstValue = new juce::DynamicObject();
                    firstValue->setProperty("address", packet->address);
                    firstValue->setProperty("typeTags", packet->typeTags);
                    firstValue->setProperty("value", packet->firstValue);
                    obj->setProperty("firstValue", juce::var(firstValue));
                }
            }

            contract_harness_utils::runtimeTelemetryView(processor.getControlServer())
                .setTempo(140.0f);
            const auto secondFrame = readWsFrame(wsFd, 2500);
            if (secondFrame.has_value()) {
                const auto packet = parseOscPacket(secondFrame->payload);
                if (packet.has_value()) {
                    auto* secondValue = new juce::DynamicObject();
                    secondValue->setProperty("address", packet->address);
                    secondValue->setProperty("typeTags", packet->typeTags);
                    secondValue->setProperty("value", packet->firstValue);
                    obj->setProperty("updatedValue", juce::var(secondValue));
                }
            }

            ::close(wsFd);
        }

        root->setProperty("websocketListen", juce::var(obj));
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
                         "OK: wrote OSCQueryServer contract (%zu bytes) to %s\n",
                         contract.size(),
                         opts.contractPath.c_str());
            return 0;
        }
        case HarnessOptions::Verify:
            return verifyJsonContract("OSCQueryServer contract", contract, opts.contractPath) ? 0 : 3;
        case HarnessOptions::Print:
        default:
            std::fprintf(stdout, "%s\n", contract.c_str());
            return 0;
    }
}
