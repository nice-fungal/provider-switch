import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ImeSafeInput } from "@/components/ui/ime-safe-input";
import { RequestHeadersEditor } from "./RequestHeadersEditor";
import type { ProviderFormProps, ProviderFormValues } from "./ProviderForm";
import { resolveKiloModelIcon } from "@/utils/kiloModelIcon";

type KiloProviderFormProps = Omit<ProviderFormProps, "appId">;

const DEFAULT_NPM_PACKAGE = "@ai-sdk/openai-compatible";
const DEFAULT_THINKING_TYPE = "enabled";
const DEFAULT_REASONING_EFFORT = "high";

/**
 * Persist a Kilo/AI-SDK provider block directly. The provider ID is already
 * stored by CC Switch, so it must not wrap this object again.
 */
function buildKiloSettingsConfig(params: {
  providerName: string;
  npm: string;
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string>;
  extraOptions: Record<string, string>;
  modelId: string;
  modelName: string;
  thinkingType: string;
  reasoningEffort: string;
}): Record<string, unknown> {
  const {
    providerName,
    npm,
    baseUrl,
    apiKey,
    headers,
    extraOptions,
    modelId,
    modelName,
    thinkingType,
    reasoningEffort,
  } = params;
  const options: Record<string, unknown> = {
    ...extraOptions,
    baseURL: baseUrl.trim(),
    apiKey: apiKey.trim(),
  };
  if (Object.keys(headers).length > 0) options.headers = headers;

  return {
    name: providerName.trim(),
    npm: npm.trim() || DEFAULT_NPM_PACKAGE,
    models: {
      [modelId.trim()]: {
        name: modelName.trim() || modelId.trim(),
      },
    },
    thinking: {
      type: thinkingType.trim(),
    },
    reasoning_effort: reasoningEffort.trim(),
    options,
  };
}

export function KiloProviderForm({
  submitLabel,
  onSubmit,
  onCancel,
  onSubmittingChange,
  onSubmitReadyChange,
  initialData,
  showButtons = true,
}: KiloProviderFormProps) {
  const { t } = useTranslation();

  const [providerName, setProviderName] = useState(initialData?.name ?? "");
  const [npm, setNpm] = useState(DEFAULT_NPM_PACKAGE);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [extraOptions, setExtraOptions] = useState<Record<string, string>>({});
  // Kilo presents a single-model experience; the backend stores one explicit
  // model string for the current upstream provider.
  const [modelId, setModelId] = useState("");
  const [modelName, setModelName] = useState("");
  const [thinkingType, setThinkingType] = useState(DEFAULT_THINKING_TYPE);
  const [reasoningEffort, setReasoningEffort] = useState(
    DEFAULT_REASONING_EFFORT,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onSubmitReadyChange?.(true);
  }, [onSubmitReadyChange]);

  useEffect(() => {
    const settings = initialData?.settingsConfig;
    if (!settings) {
      setNpm(DEFAULT_NPM_PACKAGE);
      setBaseUrl("");
      setApiKey("");
      setHeaders({});
      setExtraOptions({});
      setModelId("");
      setModelName("");
      setThinkingType(DEFAULT_THINKING_TYPE);
      setReasoningEffort(DEFAULT_REASONING_EFFORT);
      return;
    }
    setNpm(
      typeof settings.npm === "string" ? settings.npm : DEFAULT_NPM_PACKAGE,
    );
    const options =
      settings.options && typeof settings.options === "object"
        ? (settings.options as Record<string, unknown>)
        : undefined;
    if (typeof options?.baseURL === "string") setBaseUrl(options.baseURL);
    if (typeof options?.apiKey === "string") setApiKey(options.apiKey);
    if (options?.headers && typeof options.headers === "object") {
      setHeaders(options.headers as Record<string, string>);
    }
    if (options) {
      const extras = Object.fromEntries(
        Object.entries(options).filter(
          ([key, value]) =>
            !["baseURL", "apiKey", "headers"].includes(key) &&
            typeof value === "string",
        ),
      ) as Record<string, string>;
      setExtraOptions(extras);
    } else {
      setExtraOptions({});
    }
    const thinking =
      settings.thinking && typeof settings.thinking === "object"
        ? (settings.thinking as Record<string, unknown>)
        : undefined;
    setThinkingType(
      typeof thinking?.type === "string" && thinking.type.trim()
        ? thinking.type
        : DEFAULT_THINKING_TYPE,
    );
    setReasoningEffort(
      typeof settings.reasoning_effort === "string" &&
        settings.reasoning_effort.trim()
        ? settings.reasoning_effort
        : DEFAULT_REASONING_EFFORT,
    );
    if (settings.models && typeof settings.models === "object") {
      const [entry] = Object.entries(
        settings.models as Record<string, { name?: unknown }>,
      );
      if (entry) {
        const [id, model] = entry;
        setModelId(id);
        setModelName(typeof model?.name === "string" ? model.name : id);
      }
    }
  }, [initialData]);

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  const extraOptionEntries = useMemo(
    () => Object.entries(extraOptions),
    [extraOptions],
  );

  const handleAddExtraOption = () => {
    setExtraOptions((prev) => ({ ...prev, [`option-${Date.now()}`]: "" }));
  };

  const handleRemoveExtraOption = (key: string) => {
    setExtraOptions((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleExtraOptionKeyChange = (oldKey: string, newKey: string) => {
    const trimmed = newKey.trim();
    if (!trimmed || trimmed === oldKey) return;
    setExtraOptions((prev) => {
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(prev)) {
        next[key === oldKey ? trimmed : key] = value;
      }
      return next;
    });
  };

  const handleExtraOptionValueChange = (key: string, value: string) => {
    setExtraOptions((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !providerName.trim() ||
      !modelId.trim() ||
      !thinkingType.trim() ||
      !reasoningEffort.trim()
    ) {
      return;
    }

    const settingsConfig = buildKiloSettingsConfig({
      providerName,
      npm,
      baseUrl,
      apiKey,
      headers,
      extraOptions,
      modelId,
      modelName,
      thinkingType,
      reasoningEffort,
    });

    const existingIcon = initialData?.icon?.trim() || "";
    const modelIcon = resolveKiloModelIcon(modelId);
    const preservedIcon = existingIcon === "glm" ? "" : existingIcon;

    const payload: ProviderFormValues = {
      name: providerName.trim(),
      websiteUrl: "",
      notes: "",
      settingsConfig: JSON.stringify(settingsConfig),
      icon: modelIcon || preservedIcon,
      iconColor:
        modelIcon || !preservedIcon ? "" : initialData?.iconColor?.trim() || "",
    };

    setIsSubmitting(true);
    try {
      await onSubmit(payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      id="provider-form"
      onSubmit={handleSubmit}
      className="space-y-6 glass rounded-xl p-6 border border-white/10"
    >
      <div className="space-y-2">
        <Label htmlFor="kilo-provider-name">
          {t("kilo.form.providerName", { defaultValue: "Provider Name" })}
        </Label>
        <ImeSafeInput
          id="kilo-provider-name"
          value={providerName}
          onValueChange={setProviderName}
          placeholder="Volc"
        />
      </div>

      {/* NPM Package */}
      <div className="space-y-2">
        <Label htmlFor="kilo-npm">
          {t("kilo.form.npmPackage", { defaultValue: "NPM Package" })}
        </Label>
        <ImeSafeInput
          id="kilo-npm"
          value={npm}
          onValueChange={setNpm}
          placeholder={DEFAULT_NPM_PACKAGE}
        />
      </div>

      {/* Base URL */}
      <div className="space-y-2">
        <Label htmlFor="kilo-base-url">
          {t("kilo.form.baseUrl", { defaultValue: "Base URL" })}
        </Label>
        <ImeSafeInput
          id="kilo-base-url"
          value={baseUrl}
          onValueChange={setBaseUrl}
          placeholder="https://ark.cn-beijing.volces.com/api/coding/v3"
          required
        />
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <Label htmlFor="kilo-api-key">
          {t("kilo.form.apiKey", { defaultValue: "API Key" })}
        </Label>
        <ImeSafeInput
          id="kilo-api-key"
          type="password"
          value={apiKey}
          onValueChange={setApiKey}
          autoComplete="off"
          required
        />
      </div>

      <RequestHeadersEditor headers={headers} onHeadersChange={setHeaders} />

      {/* Models */}
      <div className="space-y-3 border-l border-border-default pl-3">
        <Label>{t("kilo.form.models", { defaultValue: "Model" })}</Label>
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <span className="flex-1">
            {t("kilo.form.modelId", { defaultValue: "Model ID" })}
          </span>
          <span className="flex-1">
            {t("kilo.form.modelName", { defaultValue: "Model Name" })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ImeSafeInput
            value={modelId}
            onValueChange={setModelId}
            placeholder="glm-5.3"
            aria-label={t("kilo.form.modelId", { defaultValue: "Model ID" })}
            required
            className="flex-1"
          />
          <ImeSafeInput
            value={modelName}
            onValueChange={setModelName}
            placeholder="GLM-5.3"
            aria-label={t("kilo.form.modelName", {
              defaultValue: "Model Name",
            })}
            className="flex-1"
          />
        </div>
      </div>

      {/* Request body overrides */}
      <div className="space-y-3 border-l border-border-default pl-3">
        <Label>
          {t("kilo.form.requestBody", {
            defaultValue: "Request Body",
          })}
        </Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="kilo-thinking-type">
              {t("kilo.form.thinkingType", {
                defaultValue: "Thinking Type",
              })}
            </Label>
            <ImeSafeInput
              id="kilo-thinking-type"
              value={thinkingType}
              onValueChange={setThinkingType}
              placeholder={DEFAULT_THINKING_TYPE}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kilo-reasoning-effort">
              {t("kilo.form.reasoningEffort", {
                defaultValue: "Reasoning Effort",
              })}
            </Label>
            <ImeSafeInput
              id="kilo-reasoning-effort"
              value={reasoningEffort}
              onValueChange={setReasoningEffort}
              placeholder={DEFAULT_REASONING_EFFORT}
              required
            />
          </div>
        </div>
      </div>

      {/* Extra Options */}
      <div className="space-y-2 border-l border-border-default pl-3">
        <div className="flex items-center justify-between">
          <Label>
            {t("kilo.form.extraOptions", { defaultValue: "Options" })}
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddExtraOption}
            className="h-7 gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("common.add", { defaultValue: "Add" })}
          </Button>
        </div>
        {extraOptionEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">
            {t("kilo.form.noExtraOptions", {
              defaultValue: "No extra options configured",
            })}
          </p>
        ) : (
          <div className="space-y-2">
            {extraOptionEntries.map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <ImeSafeInput
                  value={key.startsWith("option-") ? "" : key}
                  onValueChange={(next) =>
                    handleExtraOptionKeyChange(key, next)
                  }
                  placeholder="timeout"
                  className="flex-1"
                />
                <ImeSafeInput
                  value={value}
                  onValueChange={(next) =>
                    handleExtraOptionValueChange(key, next)
                  }
                  placeholder="600000"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveExtraOption(key)}
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showButtons && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onCancel}>
            {t("common.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
