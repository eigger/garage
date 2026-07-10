"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { useToast } from "../../lib/toast-context";
import { useConfirm } from "../../lib/confirm-context";
import { SettingsBar } from "../settings-bar";
import { fuelTypeLabelKey } from "../../lib/fuelType";
import { formatItemLabel } from "../../lib/i18n/itemLabel";
import type { TranslationKey } from "../../lib/i18n/translations";
import type { FuelType, MaintenancePresetTemplate, RecordCategory } from "../../lib/types";
import {
  FUEL_TYPES,
  adminPresetCatalogDefs,
  maintenancePresetDefsForFuelType,
  resolveCatalogKey,
  type AdminItemKey,
  type MaintenanceItemKey,
  type MaintenancePresetDef,
} from "@garage/shared";

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;
type AddMode = "catalog" | "custom";
type PresetCategory = RecordCategory;

const FUEL_TYPES_LIST: FuelType[] = [...FUEL_TYPES];

function presetStoredKey(name: string): string | null {
  return resolveCatalogKey(name)?.key ?? null;
}

function isCatalogPresetName(name: string): boolean {
  return resolveCatalogKey(name) !== null;
}

export default function MaintenancePresetsPage() {
  const router = useRouter();
  const { user, loading: authLoading, requireAuth, isAdmin } = useAuth();
  const { t } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [category, setCategory] = useState<PresetCategory>("MAINTENANCE");
  const [fuelType, setFuelType] = useState<FuelType>("GASOLINE");
  const [presets, setPresets] = useState<MaintenancePresetTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authLoading && user && !isAdmin) router.replace("/");
  }, [authLoading, user, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ category });
    if (category === "MAINTENANCE") params.set("fuelType", fuelType);
    const res = await apiFetch(`/api/maintenance-presets?${params.toString()}`);
    if (res.ok) setPresets(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    if (user && isAdmin) load();
  }, [user, isAdmin, fuelType, category]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || (user && isAdmin && loading)) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }
  if (!user || !isAdmin) return null;

  const isAdministrative = category === "ADMINISTRATIVE";

  return (
    <main className="container">
      <SettingsBar />
      <p>
        <Link href="/">{t("backToDashboard")}</Link>
      </p>
      <h1>{t("presetsHeading")}</h1>
      <p>{isAdministrative ? t("presetsIntroAdministrative") : t("presetsIntro")}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["MAINTENANCE", "ADMINISTRATIVE"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setCategory(tab)}
            style={{
              background: category === tab ? "#18523f" : "#eee",
              color: category === tab ? "#fff" : "#333",
              flex: 1,
            }}
          >
            {tab === "MAINTENANCE" ? t("presetsTabMaintenance") : t("presetsTabAdministrative")}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={async () => {
          const confirmKey = isAdministrative
            ? "presetsApplyExistingAdministrativeConfirm"
            : "presetsApplyExistingConfirm";
          if (!(await confirm(t(confirmKey)))) return;
          const res = await apiFetch("/api/maintenance-presets/apply-existing", {
            method: "POST",
            body: JSON.stringify(
              isAdministrative ? { category: "ADMINISTRATIVE" } : { category: "MAINTENANCE", fuelType },
            ),
          });
          if (!res.ok) {
            showToast(t("toastError"), "error");
            return;
          }
          const data = (await res.json()) as { updatedVehicles: number };
          showToast(t("presetsApplyExistingDone", { count: data.updatedVehicles }), "success");
        }}
        style={{ marginBottom: 16 }}
      >
        {isAdministrative ? t("presetsApplyExistingAdministrative") : t("presetsApplyExisting")}
      </button>

      {!isAdministrative && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {FUEL_TYPES_LIST.map((ft) => (
            <button
              key={ft}
              type="button"
              onClick={() => setFuelType(ft)}
              style={{
                background: fuelType === ft ? "#18523f" : "#eee",
                color: fuelType === ft ? "#fff" : "#333",
                flex: 1,
              }}
            >
              {t(fuelTypeLabelKey(ft))}
            </button>
          ))}
        </div>
      )}

      <ul className="list">
        {presets.map((p) => (
          <PresetRow key={p.id} preset={p} onChanged={load} t={t} showToast={showToast} confirm={confirm} />
        ))}
      </ul>

      <h2>{t("addPreset")}</h2>
      <AddPresetForm
        category={category}
        fuelType={fuelType}
        presets={presets}
        onCreated={load}
        t={t}
        showToast={showToast}
      />
    </main>
  );
}

function PresetRow({
  preset,
  onChanged,
  t,
  showToast,
  confirm,
}: {
  preset: MaintenancePresetTemplate;
  onChanged: () => void;
  t: Translator;
  showToast: (message: string, type?: "success" | "error") => void;
  confirm: (message: string, options?: { confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
}) {
  const isCatalog = isCatalogPresetName(preset.name);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(preset.name);
  const [intervalKm, setIntervalKm] = useState(preset.intervalKm ? String(preset.intervalKm) : "");
  const [intervalMonths, setIntervalMonths] = useState(
    preset.intervalMonths ? String(preset.intervalMonths) : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const isAdministrative = preset.category === "ADMINISTRATIVE";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/maintenance-presets/${preset.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(isCatalog ? {} : { name }),
          intervalKm: intervalKm ? Number(intervalKm) : undefined,
          intervalMonths: intervalMonths ? Number(intervalMonths) : undefined,
        }),
      });
      if (res.ok) {
        setEditing(false);
        showToast(t("toastSaved"), "success");
        onChanged();
      } else {
        showToast(t("toastError"), "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!(await confirm(t("confirmDelete")))) return;
    const res = await apiFetch(`/api/maintenance-presets/${preset.id}`, { method: "DELETE" });
    if (res.ok) {
      showToast(t("toastDeleted"), "success");
      onChanged();
    } else {
      showToast(t("toastError"), "error");
    }
  }

  if (editing) {
    return (
      <li className="list-item">
        <form onSubmit={handleSave} className="form">
          {isCatalog ? (
            <p style={{ margin: 0, fontWeight: 600 }}>{formatItemLabel(t, preset.name)}</p>
          ) : (
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          )}
          {!isAdministrative && (
            <input
              type="number"
              placeholder={t("intervalKm")}
              value={intervalKm}
              onChange={(e) => setIntervalKm(e.target.value)}
            />
          )}
          <input
            type="number"
            placeholder={t("intervalMonths")}
            value={intervalMonths}
            onChange={(e) => setIntervalMonths(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={submitting}>
              {submitting ? t("saving") : t("save")}
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li
      className="list-item"
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
    >
      <span>
        {formatItemLabel(t, preset.name)}
        {!isAdministrative && preset.intervalKm ? ` · ${preset.intervalKm}km` : ""}
        {preset.intervalMonths ? ` · ${preset.intervalMonths}${t("months")}` : ""}
      </span>
      <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
          {t("edit")}
        </button>
        <button type="button" className="btn-danger" onClick={handleDelete}>
          {t("delete")}
        </button>
      </span>
    </li>
  );
}

function AddPresetForm({
  category,
  fuelType,
  presets,
  onCreated,
  t,
  showToast,
}: {
  category: PresetCategory;
  fuelType: FuelType;
  presets: MaintenancePresetTemplate[];
  onCreated: () => void;
  t: Translator;
  showToast: (message: string, type?: "success" | "error") => void;
}) {
  const [mode, setMode] = useState<AddMode>("catalog");
  const [catalogKey, setCatalogKey] = useState("");
  const [customName, setCustomName] = useState("");
  const [intervalKm, setIntervalKm] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isAdministrative = category === "ADMINISTRATIVE";

  const existingKeys = useMemo(
    () => new Set(presets.map((p) => presetStoredKey(p.name)).filter(Boolean)),
    [presets],
  );

  const catalogOptions = useMemo(() => {
    if (isAdministrative) {
      return adminPresetCatalogDefs().filter((def) => !existingKeys.has(def.itemKey));
    }
    return maintenancePresetDefsForFuelType(fuelType).filter((def) => !existingKeys.has(def.itemKey));
  }, [fuelType, existingKeys, isAdministrative]);

  useEffect(() => {
    setCatalogKey("");
    setCustomName("");
    setIntervalKm("");
    setIntervalMonths("");
    setError("");
  }, [fuelType, category, mode]);

  function applyDefIntervals(def: MaintenancePresetDef | { intervalMonths?: number; intervalKm?: number }) {
    setIntervalKm(def.intervalKm ? String(def.intervalKm) : "");
    setIntervalMonths(def.intervalMonths ? String(def.intervalMonths) : "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const name = mode === "catalog" ? catalogKey : customName.trim();
    if (!name) {
      setError(t("requiredField"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/api/maintenance-presets", {
        method: "POST",
        body: JSON.stringify({
          category,
          ...(isAdministrative ? {} : { fuelType }),
          name,
          intervalKm: !isAdministrative && intervalKm ? Number(intervalKm) : undefined,
          intervalMonths: intervalMonths ? Number(intervalMonths) : undefined,
        }),
      });
      if (res.ok) {
        setCatalogKey("");
        setCustomName("");
        setIntervalKm("");
        setIntervalMonths("");
        showToast(t("toastCreated"), "success");
        onCreated();
      } else {
        showToast(t("toastError"), "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form" noValidate>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setMode("catalog")}
          style={{
            background: mode === "catalog" ? "#18523f" : "#eee",
            color: mode === "catalog" ? "#fff" : "#333",
            flex: 1,
          }}
        >
          {t("presetAddFromCatalog")}
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          style={{
            background: mode === "custom" ? "#18523f" : "#eee",
            color: mode === "custom" ? "#fff" : "#333",
            flex: 1,
          }}
        >
          {t("presetAddCustom")}
        </button>
      </div>

      {mode === "catalog" ? (
        <select
          className="form-select"
          value={catalogKey}
          onChange={(e) => {
            const next = e.target.value;
            setCatalogKey(next);
            const def = catalogOptions.find((d) =>
              isAdministrative
                ? (d as { itemKey: AdminItemKey }).itemKey === next
                : (d as MaintenancePresetDef).itemKey === next,
            );
            if (def) applyDefIntervals(def);
          }}
          required
        >
          <option value="" disabled>
            {t("presetSelectCatalogItem")}
          </option>
          {catalogOptions.map((def) => {
            const key = isAdministrative
              ? (def as { itemKey: AdminItemKey }).itemKey
              : (def as MaintenancePresetDef).itemKey;
            return (
              <option key={key} value={key}>
                {formatItemLabel(t, key)}
              </option>
            );
          })}
        </select>
      ) : (
        <input
          placeholder={t("itemName")}
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
        />
      )}

      {!isAdministrative && (
        <input
          type="number"
          placeholder={t("intervalKm")}
          value={intervalKm}
          onChange={(e) => setIntervalKm(e.target.value)}
        />
      )}
      <input
        type="number"
        placeholder={t("intervalMonths")}
        value={intervalMonths}
        onChange={(e) => setIntervalMonths(e.target.value)}
      />
      <button type="submit" disabled={submitting || (mode === "catalog" && catalogOptions.length === 0)}>
        {submitting ? t("saving") : t("save")}
      </button>
      {error && <p className="field-error">{error}</p>}
    </form>
  );
}
