import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppSwitcher } from "@/components/AppSwitcher";
import { DEFAULT_VISIBLE_APPS } from "@/config/appConfig";

describe("AppSwitcher Kilo registration", () => {
  it("shows Kilo instead of GLM", () => {
    render(
      <AppSwitcher
        activeApp="claude"
        onSwitch={() => {}}
        visibleApps={DEFAULT_VISIBLE_APPS}
      />,
    );

    expect(screen.queryByLabelText("GLM")).toBeNull();
    expect(screen.queryByText("GLM")).toBeNull();
    expect(screen.getByLabelText("Kilo")).toBeInTheDocument();
  });

  it("switches to Kilo when selected", async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(
      <AppSwitcher
        activeApp="claude"
        onSwitch={onSwitch}
        visibleApps={DEFAULT_VISIBLE_APPS}
      />,
    );

    await user.click(screen.getByLabelText("Kilo"));
    expect(onSwitch).toHaveBeenCalledWith("kilo");
  });
});
