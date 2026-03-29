package.path = "/home/shamanic/dev/my-plugin/UserScripts/projects/Main/ui/?.lua;"
  .. "/home/shamanic/dev/my-plugin/UserScripts/projects/Main/ui/?/init.lua;"
  .. "/home/shamanic/dev/my-plugin/UserScripts/projects/Main/lib/?.lua;"
  .. "/home/shamanic/dev/my-plugin/UserScripts/projects/Main/lib/?/init.lua;"
  .. package.path

local Compiler = require("modulation.route_compiler")

local function assertTrue(value, message)
  if not value then
    error(message or "assertTrue failed", 2)
  end
end

local function assertEqual(actual, expected, message)
  if actual ~= expected then
    error((message or "assertEqual failed") .. string.format(" (expected=%s actual=%s)", tostring(expected), tostring(actual)), 2)
  end
end

local function endpoint(id, direction, signalKind, scope)
  return {
    id = id,
    direction = direction,
    signalKind = signalKind,
    scope = scope or "global",
    domain = signalKind == "trigger" or signalKind == "gate" and "event" or "normalized",
    min = 0,
    max = 1,
    default = 0,
    available = true,
  }
end

local function registry(map)
  return {
    findById = function(_, id)
      return map[id]
    end,
  }
end

local function testGateToTriggerCompiles()
  local compiler = Compiler.new()
  local endpoints = registry({
    ["compare.gate"] = endpoint("compare.gate", "source", "gate"),
    ["sample_hold.trig"] = endpoint("sample_hold.trig", "target", "trigger"),
  })

  local result = compiler:compileRoute({
    id = "gate_to_trigger",
    source = "compare.gate",
    target = "sample_hold.trig",
  }, endpoints)

  assertTrue(result.ok == true, "gate -> trigger route should compile")
  assertEqual(result.compiled.coercionKind, "identity", "gate -> trigger uses identity coercion")
  assertEqual(result.compiled.mappingKind, "gate_threshold", "trigger targets use gate threshold mapping")
  assertEqual(result.compiled.applyKind, "replace", "trigger targets only allow replace")
end

local function testTriggerToTriggerCompiles()
  local compiler = Compiler.new()
  local endpoints = registry({
    ["lfo.eoc"] = endpoint("lfo.eoc", "source", "trigger"),
    ["lfo.reset"] = endpoint("lfo.reset", "target", "trigger"),
  })

  local result = compiler:compileRoute({
    id = "trigger_to_trigger",
    source = "lfo.eoc",
    target = "lfo.reset",
  }, endpoints)

  assertTrue(result.ok == true, "trigger -> trigger route should compile")
  assertEqual(result.compiled.coercionKind, "identity", "trigger -> trigger uses identity coercion")
  assertEqual(result.compiled.applyKind, "replace", "trigger targets remain replace-only")
end

local tests = {
  testGateToTriggerCompiles,
  testTriggerToTriggerCompiles,
}

for i = 1, #tests do
  tests[i]()
end

print(string.format("OK route_compiler_triggers %d tests", #tests))
