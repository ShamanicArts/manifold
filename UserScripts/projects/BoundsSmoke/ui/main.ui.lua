return {
  id = "root",
  type = "Panel",
  x = 0,
  y = 0,
  w = 400,
  h = 300,
  shellLayout = {
    mode = "fill",
  },
  children = {
    {
      id = "host",
      type = "Panel",
      x = 100,
      y = 50,
      w = 200,
      h = 120,
      style = {
        bg = 4280431428,
      },
      children = {
        {
          id = "nested",
          type = "Panel",
          x = 110,
          y = 20,
          w = 66,
          h = 40,
          style = {
            bg = 4287120418,
          },
        },
      },
    },
  },
  components = {
    {
      id = "inst",
      x = 300,
      y = 40,
      w = 111,
      h = 30,
      ref = "ui/components/simple.ui.lua",
    },
  },
}
