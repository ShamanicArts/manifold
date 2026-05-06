#include "../primitives/core/Settings.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>

#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

#include <sys/wait.h>
#include <unistd.h>

namespace {

using namespace contract_harness_utils;

constexpr const char* kSandboxRoot = "/tmp/manifold_settings_contract";
constexpr const char* kRepoScenario = "repo";
constexpr const char* kUserScenario = "user";
constexpr const char* kChildModeArg = "--child-snapshot";
constexpr const char* kChildMutateArg = "--child-mutate-save";

juce::String indentString(int indent) {
  juce::String out;
  for (int i = 0; i < indent; ++i) out += "  ";
  return out;
}

void appendCanonicalJson(const juce::var& value, juce::String& out, int indent) {
  if (auto* object = value.getDynamicObject()) {
    struct PropertyEntry {
      juce::String name;
      juce::var value;
    };
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

juce::String toCanonicalJson(const juce::var& value) {
  juce::String out;
  appendCanonicalJson(value, out, 0);
  out += "\n";
  return out;
}

juce::File sandboxRoot() { return juce::File(kSandboxRoot); }
juce::File fakeRepoRoot() { return sandboxRoot().getChildFile("fake_repo"); }
juce::File fakeRepoBuildDir() { return fakeRepoRoot().getChildFile("build_work"); }
juce::File fakeRepoConfigFile() { return fakeRepoRoot().getChildFile(".manifold.settings.json"); }
juce::File fakeRepoLauncher() { return fakeRepoRoot().getChildFile("manifold").getChildFile("ui").getChildFile("empty_launcher.lua"); }
juce::File fakeRepoDevScriptsDir() { return fakeRepoRoot().getChildFile("manifold").getChildFile("ui"); }
juce::File fakeRepoUserScriptsDir() { return fakeRepoRoot().getChildFile("UserScripts"); }
juce::File fakeRepoDspScriptsDir() { return fakeRepoRoot().getChildFile("manifold").getChildFile("dsp"); }
juce::File fakeRepoCustomUi() { return fakeRepoRoot().getChildFile("manifold").getChildFile("ui").getChildFile("custom_ui.lua"); }
juce::File userHomeDir() { return sandboxRoot().getChildFile("user_home"); }
juce::File userConfigDir() { return userHomeDir().getChildFile(".config"); }
juce::File userConfigFile() { return userConfigDir().getChildFile("Manifold").getChildFile("settings.json"); }
juce::File externalExeDir() { return sandboxRoot().getChildFile("external_runtime").getChildFile("bin"); }
juce::File copiedHarnessExe() { return externalExeDir().getChildFile("SettingsContractHarness"); }

void writeTextFile(const juce::File& file, const juce::String& text) {
  file.getParentDirectory().createDirectory();
  file.replaceWithText(text);
}

void prepareSandbox() {
  auto root = sandboxRoot();
  root.deleteRecursively();
  root.createDirectory();

  writeTextFile(fakeRepoRoot().getChildFile("CMakeLists.txt"), "cmake_minimum_required(VERSION 3.22)\nproject(FakeManifold)\n");
  fakeRepoRoot().getChildFile("manifold").createDirectory();
  fakeRepoDevScriptsDir().createDirectory();
  fakeRepoUserScriptsDir().createDirectory();
  fakeRepoDspScriptsDir().createDirectory();
  fakeRepoBuildDir().createDirectory();
  writeTextFile(fakeRepoLauncher(), "return {}\n");
  writeTextFile(fakeRepoCustomUi(), "return { ui = 'custom' }\n");

  userHomeDir().createDirectory();
  userConfigDir().createDirectory();
  externalExeDir().createDirectory();
}

struct ChildRunResult {
  int exitCode = -1;
  std::string output;
};

ChildRunResult runChildProcess(const juce::File& executable,
                               const juce::File& workingDir,
                               const std::vector<std::pair<std::string, std::string>>& envVars,
                               const std::vector<std::string>& args) {
  int pipefd[2] = {-1, -1};
  if (pipe(pipefd) != 0) {
    std::perror("pipe");
    std::exit(2);
  }

  const pid_t pid = fork();
  if (pid < 0) {
    std::perror("fork");
    std::exit(2);
  }

  if (pid == 0) {
    close(pipefd[0]);
    dup2(pipefd[1], STDOUT_FILENO);
    dup2(pipefd[1], STDERR_FILENO);
    close(pipefd[1]);

    if (chdir(workingDir.getFullPathName().toRawUTF8()) != 0) {
      std::perror("chdir");
      _exit(127);
    }

    for (const auto& [key, value] : envVars) {
      if (setenv(key.c_str(), value.c_str(), 1) != 0) {
        std::perror("setenv");
        _exit(127);
      }
    }

    std::vector<std::string> storage;
    storage.reserve(args.size() + 1);
    storage.push_back(executable.getFullPathName().toStdString());
    for (const auto& arg : args) storage.push_back(arg);

    std::vector<char*> argv;
    argv.reserve(storage.size() + 1);
    for (auto& item : storage) argv.push_back(item.data());
    argv.push_back(nullptr);

    execv(executable.getFullPathName().toRawUTF8(), argv.data());
    std::perror("execv");
    _exit(127);
  }

  close(pipefd[1]);
  std::string output;
  char buffer[4096];
  ssize_t count = 0;
  while ((count = read(pipefd[0], buffer, sizeof(buffer))) > 0) {
    output.append(buffer, static_cast<std::size_t>(count));
  }
  close(pipefd[0]);

  int status = 0;
  waitpid(pid, &status, 0);

  ChildRunResult result;
  result.output = std::move(output);
  result.exitCode = WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);
  return result;
}

juce::var parseChildJsonOrDie(const std::string& label, const ChildRunResult& result) {
  if (result.exitCode != 0) {
    std::fprintf(stderr, "ERROR: child %s failed with exit code %d\n%s\n",
                 label.c_str(), result.exitCode, result.output.c_str());
    std::exit(2);
  }

  auto parsed = juce::JSON::parse(result.output);
  if (parsed.isVoid()) {
    std::fprintf(stderr, "ERROR: child %s emitted invalid JSON\n%s\n",
                 label.c_str(), result.output.c_str());
    std::exit(2);
  }
  return parsed;
}

juce::var buildSnapshotObject(const std::string& scenario) {
  auto* obj = new juce::DynamicObject();
  auto& settings = Settings::getInstance();

  const auto configPath = settings.getConfigPath();
  const auto defaultUiScript = settings.getDefaultUiScript();
  const auto devScriptsDir = settings.getDevScriptsDir();
  const auto userScriptsDir = settings.getUserScriptsDir();
  const auto dspScriptsDir = settings.getDspScriptsDir();

  obj->setProperty("scenario", juce::String(scenario));
  obj->setProperty("configPath", configPath);
  obj->setProperty("configExists", juce::File(configPath).existsAsFile());
  obj->setProperty("oscPort", settings.getOscPort());
  obj->setProperty("oscQueryPort", settings.getOscQueryPort());
  obj->setProperty("defaultUiScript", defaultUiScript);
  obj->setProperty("defaultUiScriptExists", juce::File(defaultUiScript).existsAsFile());
  obj->setProperty("defaultUiEndsWithLauncher", defaultUiScript.endsWith("empty_launcher.lua"));
  obj->setProperty("devScriptsDir", devScriptsDir);
  obj->setProperty("userScriptsDir", userScriptsDir);
  obj->setProperty("dspScriptsDir", dspScriptsDir);
  obj->setProperty("devScriptsDirExists", juce::File(devScriptsDir).isDirectory());
  obj->setProperty("userScriptsDirExists", juce::File(userScriptsDir).isDirectory());
  obj->setProperty("dspScriptsDirExists", juce::File(dspScriptsDir).isDirectory());
  obj->setProperty("configInsideSandbox", configPath.startsWith(kSandboxRoot));
  obj->setProperty("rawJson", juce::File(configPath).existsAsFile() ? juce::File(configPath).loadFileAsString() : juce::String());

  return juce::var(obj);
}

int runChildMode(const std::string& scenario, bool mutateAndSave) {
  if (mutateAndSave) {
    auto& settings = Settings::getInstance();
    settings.setOscPort(9100);
    settings.setOscQueryPort(9101);
    settings.setDefaultUiScript(fakeRepoCustomUi().getFullPathName());
    settings.setDevScriptsDir(sandboxRoot().getChildFile("custom_dev_scripts").getFullPathName());
    settings.setUserScriptsDir(sandboxRoot().getChildFile("custom_user_scripts").getFullPathName());
    settings.setDspScriptsDir(sandboxRoot().getChildFile("custom_dsp_scripts").getFullPathName());
    settings.save();
  }

  auto snapshot = buildSnapshotObject(scenario);
  const auto json = toCanonicalJson(snapshot);
  std::fprintf(stdout, "%s", json.toStdString().c_str());
  return 0;
}

juce::var buildFullContract(const juce::File& originalExe) {
  prepareSandbox();

  if (!originalExe.existsAsFile()) {
    std::fprintf(stderr, "ERROR: harness executable missing: %s\n",
                 originalExe.getFullPathName().toRawUTF8());
    std::exit(2);
  }

  if (!originalExe.copyFileTo(copiedHarnessExe())) {
    std::fprintf(stderr, "ERROR: failed to copy harness executable to %s\n",
                 copiedHarnessExe().getFullPathName().toRawUTF8());
    std::exit(2);
  }
  copiedHarnessExe().setExecutePermission(true);

  const std::vector<std::pair<std::string, std::string>> sandboxEnv {
      {"HOME", userHomeDir().getFullPathName().toStdString()},
      {"XDG_CONFIG_HOME", userConfigDir().getFullPathName().toStdString()},
  };

  auto* root = new juce::DynamicObject();
  root->setProperty("contractVersion", 1);
  root->setProperty("sandboxRoot", sandboxRoot().getFullPathName());

  // ======================================================================
  // Repo-mode defaults (cwd-detected fake repo root)
  // ======================================================================
  {
    auto result = runChildProcess(originalExe, fakeRepoBuildDir(), sandboxEnv,
                                  {kChildModeArg, kRepoScenario});
    auto value = parseChildJsonOrDie("repo-defaults", result);
    auto* obj = value.getDynamicObject();
    obj->setProperty("configPathMatches", obj->getProperty("configPath").toString() == fakeRepoConfigFile().getFullPathName());
    obj->setProperty("devScriptsExpected", obj->getProperty("devScriptsDir").toString() == fakeRepoDevScriptsDir().getFullPathName());
    obj->setProperty("userScriptsExpected", obj->getProperty("userScriptsDir").toString() == fakeRepoUserScriptsDir().getFullPathName());
    obj->setProperty("dspScriptsExpected", obj->getProperty("dspScriptsDir").toString() == fakeRepoDspScriptsDir().getFullPathName());
    obj->setProperty("defaultUiExpected", obj->getProperty("defaultUiScript").toString() == fakeRepoLauncher().getFullPathName());
    root->setProperty("repoDefaults", value);
  }

  // ======================================================================
  // Repo-mode save + fresh-process load
  // ======================================================================
  {
    fakeRepoConfigFile().deleteFile();
    auto saveResult = runChildProcess(originalExe, fakeRepoBuildDir(), sandboxEnv,
                                      {kChildMutateArg, kRepoScenario});
    auto loadResult = runChildProcess(originalExe, fakeRepoBuildDir(), sandboxEnv,
                                      {kChildModeArg, kRepoScenario});

    auto* obj = new juce::DynamicObject();
    obj->setProperty("saved", parseChildJsonOrDie("repo-save", saveResult));
    obj->setProperty("loaded", parseChildJsonOrDie("repo-load", loadResult));
    obj->setProperty("configExists", fakeRepoConfigFile().existsAsFile());
    obj->setProperty("configPath", fakeRepoConfigFile().getFullPathName());
    root->setProperty("repoSaveLoad", juce::var(obj));
  }

  // ======================================================================
  // User-mode defaults (copied exe outside repo, cwd outside repo)
  // ======================================================================
  {
    userConfigFile().deleteFile();
    auto result = runChildProcess(copiedHarnessExe(), externalExeDir(), sandboxEnv,
                                  {kChildModeArg, kUserScenario});
    auto value = parseChildJsonOrDie("user-defaults", result);
    auto* obj = value.getDynamicObject();
    obj->setProperty("configPathMatches", obj->getProperty("configPath").toString() == userConfigFile().getFullPathName());
    obj->setProperty("userConfigPathExpected", true);
    root->setProperty("userDefaults", value);
  }

  // ======================================================================
  // User-mode save + fresh-process load
  // ======================================================================
  {
    userConfigFile().deleteFile();
    auto saveResult = runChildProcess(copiedHarnessExe(), externalExeDir(), sandboxEnv,
                                      {kChildMutateArg, kUserScenario});
    auto loadResult = runChildProcess(copiedHarnessExe(), externalExeDir(), sandboxEnv,
                                      {kChildModeArg, kUserScenario});

    auto* obj = new juce::DynamicObject();
    obj->setProperty("saved", parseChildJsonOrDie("user-save", saveResult));
    obj->setProperty("loaded", parseChildJsonOrDie("user-load", loadResult));
    obj->setProperty("configExists", userConfigFile().existsAsFile());
    obj->setProperty("configPath", userConfigFile().getFullPathName());
    root->setProperty("userSaveLoad", juce::var(obj));
  }

  // ======================================================================
  // User-mode invalid JSON fallback
  // ======================================================================
  {
    writeTextFile(userConfigFile(), "{ invalid json }\n");
    auto result = runChildProcess(copiedHarnessExe(), externalExeDir(), sandboxEnv,
                                  {kChildModeArg, kUserScenario});
    auto value = parseChildJsonOrDie("user-invalid-json", result);
    auto* obj = value.getDynamicObject();
    obj->setProperty("fellBackToDefaultPorts",
                     static_cast<int>(obj->getProperty("oscPort")) == 9000 &&
                     static_cast<int>(obj->getProperty("oscQueryPort")) == 9001);
    root->setProperty("userInvalidJsonFallback", value);
  }

  sandboxRoot().deleteRecursively();
  return juce::var(root);
}

} // namespace

int main(int argc, char* argv[]) {
  if (argc >= 3) {
    const std::string first = argv[1];
    const std::string scenario = argv[2];
    if (first == kChildModeArg) {
      return runChildMode(scenario, false);
    }
    if (first == kChildMutateArg) {
      return runChildMode(scenario, true);
    }
  }

  HarnessOptions opts;
  if (!parseOptions(argc, argv, opts)) return 1;

  const juce::File self = juce::File::getSpecialLocation(juce::File::currentExecutableFile);
  const juce::String contractJson = [&]() {
    juce::String out;
    appendCanonicalJson(buildFullContract(self), out, 0);
    out += "\n";
    return out;
  }();

  return finishJsonContract(opts, "Settings contract", contractJson.toStdString());
}
