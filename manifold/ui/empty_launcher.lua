local W = require("ui_widgets")

local background = nil

function ui_init(root)
    background = W.Panel.new(root, "launcherBackground", {
        bg = 0xff0b1220,
    })

    if type(_G) == "table" and type(_G.shell) == "table" and type(_G.shell.setTitle) == "function" then
        _G.shell:setTitle("MANIFOLD")
    end
end

function ui_resized(w, h)
    if background ~= nil and type(background.setBounds) == "function" then
        background:setBounds(0, 0, math.floor(w), math.floor(h))
    end
end

function ui_update()
end
