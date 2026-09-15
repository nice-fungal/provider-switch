import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProviderForm } from "@/components/providers/forms/ProviderForm";
import { KiloProviderForm } from "@/components/providers/forms/KiloProviderForm";

describe("KiloProviderForm", () => {
  it("renders the Kilo-specific fields with the default NPM package", () => {
    render(
      <ProviderForm
        appId="kilo"
        submitLabel="Save"
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByLabelText("Provider Name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Provider ID")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Base URL")).toBeInTheDocument();
    expect(screen.getByLabelText("API Key")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("@ai-sdk/openai-compatible"),
    ).toBeInTheDocument();
    // Must not fall through to the Claude default branch.
    expect(screen.queryByText(/ANTHROPIC_AUTH_TOKEN/)).toBeNull();
  });

  it("accepts a model id and name and exposes a reasoning toggle", async () => {
    render(
      <KiloProviderForm
        submitLabel="Save"
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByPlaceholderText("glm-5.3")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("GLM-5.3")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.queryByText(/No models configured/)).not.toBeInTheDocument();
  });

  it("cancels without submitting", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    render(
      <KiloProviderForm
        submitLabel="Save"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires the single model ID before submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <KiloProviderForm
        submitLabel="Save"
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("Provider Name"), "Volc");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the provider data and generated JSON", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <KiloProviderForm
        submitLabel="Save"
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );

    await user.type(screen.getByLabelText("Provider Name"), "Volc");
    await user.type(screen.getByLabelText("Base URL"), "https://example.test/v1");
    await user.type(screen.getByLabelText("API Key"), "secret");
    await user.type(screen.getByLabelText("Model ID"), "glm-5.3");
    await user.type(screen.getByLabelText("Model Name"), "GLM-5.3");
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Volc",
        settingsConfig: expect.any(String),
      }),
    );
    expect(onSubmit.mock.calls[0][0].providerKey).toBeUndefined();
    expect(onSubmit.mock.calls[0][0].icon).toBe("zai");
    expect(JSON.parse(onSubmit.mock.calls[0][0].settingsConfig)).toEqual({
      name: "Volc",
      npm: "@ai-sdk/openai-compatible",
      models: {
        "glm-5.3": { name: "GLM-5.3", reasoning: true },
      },
      options: {
        baseURL: "https://example.test/v1",
        apiKey: "secret",
      },
    });
  });
});
