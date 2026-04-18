import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command.toLowerCase();
    if (!command.includes("cmake")) return;

    const hasTail = command.includes("-tail");
    const hasHead = command.includes("-head");
    const hasTmux = command.includes("tmux");

    if (hasTail || hasHead) {
      let reason = "no -tail/-head on build commands";
      if (!hasTmux) {
        reason += ". use tmux for all long running builds";
      }
      return { block: true, reason };
    }

    return { block: false, reason: undefined };
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command.toLowerCase();
    if (!command.includes("cmake")) return;
    if (command.includes("-tail") || command.includes("-head")) return;
    if (command.includes("tmux")) return;

    if (event.content && event.content[0]?.type === "text") {
      event.content[0].text += "\n\nReminder: use tmux for all long running builds";
    }
  });
}
