"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useSettings } from "../../lib/i18n/settings-context";
import { useToast } from "../../lib/toast-context";
import type { FuelType, Vehicle } from "../../lib/types";
import { fuelTypeLabelKey } from "../../lib/fuelType";
import { FUEL_TYPES } from "@garage/shared";

export default function VehiclesPage() {
  const { user, loading: authLoading, requireAuth, isAdmin } = useAuth();
  const { t } = useSettings();
  const { showToast } = useToast();
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
    if (!name.trim() || !fuelType) {
      setError(t("requiredField"));
      return;
    }
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
        showToast(t("toastError"), "error");
        return;
      }
      setName("");
      setPlate("");
      setMake("");
      setModel("");
      setYear("");
      setFuelType("");
      showToast(t("toastCreated"), "success");
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
          <form onSubmit={handleSubmit} className="form" noValidate>
            <input
              placeholder={t("vehicleName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              {FUEL_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {t(fuelTypeLabelKey(ft))}
                </option>
              ))}
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
