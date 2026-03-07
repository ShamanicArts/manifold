local looperBaseline = loadDspModule("./looper_baseline.lua")

function buildPlugin(ctx)
  if type(looperBaseline) ~= "table" or type(looperBaseline.attach) ~= "function" then
    error("project looper baseline did not expose attach(ctx)")
  end

  local baseline = looperBaseline.attach(ctx)
  return {
    onParamChange = function(path, value)
      if baseline and type(baseline.applyParam) == "function" then
        baseline.applyParam(path, value)
      end
    end,
  }
end
