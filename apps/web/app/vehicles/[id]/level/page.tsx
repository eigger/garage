"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../lib/api";
import { useSettings } from "../../../../lib/i18n/settings-context";
import { LevelCard } from "../../../../components/LevelCard";
import type { VehicleGamification } from "../../../../lib/types";

export default function VehicleLevelPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;
  const { t } = useSettings();
  const [gamification, setGamification] = useState<VehicleGamification | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/vehicles/${vehicleId}/gamification`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setGamification)
      .finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) return null;

  return (
    <section>
      <h2 style={{ margin: "0 0 12px" }}>{t("vehicleLevelHeading")}</h2>
      {gamification && <LevelCard data={gamification} />}
    </section>
  );
}
