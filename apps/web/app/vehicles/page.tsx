"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { SettingsBar } from "../settings-bar";
import type { FuelType, Vehicle } from "../../lib/types";
import { fuelTypeLabelKey } from "../../lib/fuelType";

export default function VehiclesPage() {
  const { user, loading: authLoading, requireAuth, isAdmin } = useAuth();
  const { t } = useSettings();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [fuelType, setFuelType] = useState<FuelType | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    requireAuth();
  }, [authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadVehicles() {
    const res = await apiFetch("/api/vehicles");
    setVehicles(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    if (user) loadVehicles();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/vehicles", {
        method: "POST",
        body: JSON.stringify({
          name,
          plate: plate || undefined,
          make: make || undefined,
          model: model || undefined,
          year: year ? Number(year) : undefined,
          fuelType: fuelType || undefined,
        }),
      });
      if (!res.ok) {
        setError(t("saveError"));
        return;
      }
      setName("");
      setPlate("");
      setMake("");
      setModel("");
      setYear("");
      setFuelType("");
      await loadVehicles();
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || (user && loading)) {
    return (
      <main className="container">
        <p>{t("loading")}</p>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="container">
      <SettingsBar />
      <p>
        <Link href="/">{t("backToDashboard")}</Link>
      </p>
      <h1>{t("vehiclesHeading")}</h1>

      <ul className="list">
        {vehicles.map((v) => (
          <li key={v.id} className="list-item">
            <Link href={`/vehicles/${v.id}`}>
              {v.name} {v.plate ? `(${v.plate})` : ""}
              {v.fuelType ? ` · ${t(fuelTypeLabelKey(v.fuelType))}` : ""}
            </Link>
          </li>
        ))}
      </ul>

      {isAdmin && (
        <>
          <h2>{t("addVehicle")}</h2>
          <form onSubmit={handleSubmit} className="form">
            <input
              placeholder={t("vehicleName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              placeholder={t("vehiclePlate")}
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
            />
            <input
              placeholder={t("vehicleMake")}
              value={make}
              onChange={(e) => setMake(e.target.value)}
            />
            <input
              placeholder={t("vehicleModel")}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <input
              type="number"
              placeholder={t("vehicleYear")}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
            <select
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value as FuelType | "")}
              required
            >
              <option value="" disabled>
                {t("vehicleFuelType")}
              </option>
              <option value="GASOLINE">{t("fuelTypeGasoline")}</option>
              <option value="DIESEL">{t("fuelTypeDiesel")}</option>
              <option value="LPG">{t("fuelTypeLpg")}</option>
              <option value="ELECTRIC">{t("fuelTypeElectric")}</option>
            </select>
            <button type="submit" disabled={submitting}>
              {submitting ? t("saving") : t("save")}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        </>
      )}
    </main>
  );
}
