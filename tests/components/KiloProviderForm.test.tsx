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

  it("offers the Volcano preset when creating a new Kilo provider", () => {
    render(
      <KiloProviderForm
        submitLabel="Save"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /火山/ })).toBeInTheDocument();

    const presetButton = screen.getByRole("button", { name: /火山/ });
    const customButton = screen.getByRole("button", {
      name: /providerPreset\.custom/,
    });
    expect(presetButton.compareDocumentPosition(customButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    expect(
      screen.queryByLabelText("Kilo Configuration JSON"),
    ).toBeInTheDocument();
  });

  it("fills the form and JSON preview from the Volcano preset", () => {
    render(
      <KiloProviderForm
        submitLabel="Save"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /火山/ }));

    expect(screen.getByLabelText("Provider Name")).toHaveValue(
      "火山 Coding Plan",
    );
    expect(screen.getByLabelText("Base URL")).toHaveValue(
      "https://ark.cn-beijing.volces.com/api/coding/v3",
    );
    expect(screen.getByLabelText("Model ID")).toHaveValue("glm-5.3");
    expect(screen.getByLabelText("Model Name")).toHaveValue("GLM-5.3");
    expect(screen.getByLabelText("Thinking Type")).toHaveValue("enabled");
    expect(screen.getByLabelText("Reasoning Effort")).toHaveValue("high");

    const apiKeyInput = screen.getByLabelText("API Key") as HTMLInputElement;
    expect(apiKeyInput).toHaveValue("");
    expect(apiKeyInput).toBeRequired();

    expect(screen.getByLabelText("Kilo Configuration JSON")).toHaveValue(
      JSON.stringify(
        {
          models: {
            "glm-5.3": { name: "GLM-5.3" },
          },
          thinking: { type: "enabled" },
          reasoning_effort: "high",
          options: {
            baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3",
            apiKey: "",
          },
        },
        null,
        2,
      ),
    );
  });

  it("submits the same config as the preview after filling the API key", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <KiloProviderForm
        submitLabel="Save"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /火山/ }));
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "  volc-secret  " },
    });

    const expectedConfig = {
      models: {
        "glm-5.3": { name: "GLM-5.3" },
      },
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      options: {
        baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3",
        apiKey: "volc-secret",
      },
    };
    expect(screen.getByLabelText("Kilo Configuration JSON")).toHaveValue(
      JSON.stringify(expectedConfig, null, 2),
    );

    fireEvent.submit(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "火山 Coding Plan",
          websiteUrl:
            "https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan",
          settingsConfig: JSON.stringify(expectedConfig),
          icon: "zai",
          iconColor: "",
        }),
      ),
    );

    const submittedConfig = JSON.parse(
      onSubmit.mock.calls[0][0].settingsConfig,
    );
    expect(Object.keys(submittedConfig)).not.toContain("name");
    expect(Object.keys(submittedConfig)).not.toContain("npm");
  });

  it("resets to a blank form when switching back to custom", () => {
    render(
      <KiloProviderForm
        submitLabel="Save"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /火山/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /providerPreset\.custom/ }),
    );

    expect(screen.getByLabelText("Provider Name")).toHaveValue("");
    expect(screen.getByLabelText("Base URL")).toHaveValue("");
    expect(screen.getByLabelText("Model ID")).toHaveValue("");
    expect(screen.getByLabelText("Kilo Configuration JSON")).toHaveValue(
      JSON.stringify(
        {
          models: {},
          thinking: { type: "enabled" },
          reasoning_effort: "high",
          options: {
            baseURL: "",
            apiKey: "",
          },
        },
        null,
        2,
      ),
    );
  });

  it("hides the preset selector when editing an existing Kilo provider", () => {
    render(
      <KiloProviderForm
        submitLabel="Save"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        initialData={{
          name: "Existing provider",
          settingsConfig: {
            models: { "glm-5.3": { name: "GLM-5.3" } },
            thinking: { type: "enabled" },
            reasoning_effort: "high",
            options: {
              baseURL: "https://example.com/v1",
              apiKey: "secret",
            },
          },
        }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /火山/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Provider Name")).toHaveValue(
      "Existing provider",
    );
    expect(screen.getByLabelText("Base URL")).toHaveValue(
      "https://example.com/v1",
    );
    expect(screen.getByLabelText("Model ID")).toHaveValue("glm-5.3");
  });
});
