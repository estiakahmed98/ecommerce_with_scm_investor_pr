"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, X } from "lucide-react";
import { ALLOWED_SHIPPING_AREAS } from "@/lib/shipping-areas";
import ShippingRatesSkeleton from "@/components/ui/ShippingRatesSkeleton";

type ShippingRate = {
  id: number;
  country: string;
  area: string;
  baseCost: string | number;
  weightSlabs?: unknown;
  freeMinOrder?: string | number | null;
  isActive: boolean;
  priority: number;
};

type RateForm = {
  country: string;
  area: string;
  baseCost: string;
  freeMinOrder: string;
  isActive: boolean;
  priority: string;
};

type WeightSlabInput = {
  minWeight: string;
  maxWeight: string;
  cost: string;
};

const defaultForm: RateForm = {
  country: "BD",
  area: ALLOWED_SHIPPING_AREAS[0],
  baseCost: "0",
  freeMinOrder: "",
  isActive: true,
  priority: "1000",
};

type CountryOption = { name: string; iso2: string };

function parseWeightSlabs(raw: unknown): WeightSlabInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => typeof item === "object" && item !== null)
    .map((item) => {
      const slab = item as Record<string, unknown>;
      return {
        minWeight:
          slab.minWeight === undefined || slab.minWeight === null
            ? ""
            : String(slab.minWeight),
        maxWeight:
          slab.maxWeight === undefined || slab.maxWeight === null
            ? ""
            : String(slab.maxWeight),
        cost:
          slab.cost === undefined || slab.cost === null ? "" : String(slab.cost),
      };
    });
}

export default function ShippingRatesPage() {
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [form, setForm] = useState<RateForm>(defaultForm);
  const [weightSlabs, setWeightSlabs] = useState<WeightSlabInput[]>([]);
  const [editing, setEditing] = useState<ShippingRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const ratesRes = await fetch("/api/admin/shipping-rates", { cache: "no-store" });
      const ratesData = await ratesRes.json();
      if (!ratesRes.ok) {
        throw new Error(ratesData?.error || "Failed to load rates");
      }
      setRates(Array.isArray(ratesData) ? ratesData : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shipping rates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadCountries = async () => {
    setLoadingCountries(true);
    try {
      const res = await fetch("/api/geo/countries", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load countries");
      setCountries(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load countries");
    } finally {
      setLoadingCountries(false);
    }
  };

  // Memoize country options to prevent unnecessary re-renders
  const countryOptions = useMemo(() => {
    return countries.map((c) => (
      <option key={c.iso2} value={c.iso2}>
        {c.name} ({c.iso2})
      </option>
    ));
  }, [countries]);

  // Memoize shipping rate items to prevent unnecessary re-renders
  const shippingRateItems = useMemo(() => {
    return rates.map((r) => (
      <div
        key={r.id}
        className="border-b py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
      >
        <div className="text-sm">
          <p className="font-medium">
            #{r.id} {r.country} {">"} {r.area}
          </p>
          <p className="text-muted-foreground">
            Base: {Number(r.baseCost)} | Free Over:{" "}
            {r.freeMinOrder === null || r.freeMinOrder === undefined
              ? "Not set"
              : Number(r.freeMinOrder)}{" "}
            | Priority: {r.priority}
          </p>
          <p className="text-muted-foreground">
            Weight Slabs: {Array.isArray(r.weightSlabs) ? r.weightSlabs.length : 0}
          </p>
          <p className="text-muted-foreground">
            Status: {r.isActive ? "Active" : "Inactive"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-primary px-3 py-1 rounded text-sm"
            onClick={() => beginEdit(r)}
          >
            Edit
          </button>
          <button
            className="btn-danger px-3 py-1 rounded text-sm"
            onClick={() => removeRate(r)}
          >
            Delete
          </button>
        </div>
      </div>
    ));
  }, [rates]);

  useEffect(() => {
    loadCountries();
  }, []);

  const beginEdit = (rate: ShippingRate) => {
    setEditing(rate);
    setError(null);
    setSuccess(null);
    setForm({
      country: rate.country || "BD",
      area: rate.area || "",
      baseCost: String(rate.baseCost ?? "0"),
      freeMinOrder:
        rate.freeMinOrder === null || rate.freeMinOrder === undefined
          ? ""
          : String(rate.freeMinOrder),
      isActive: Boolean(rate.isActive),
      priority: String(rate.priority ?? 1000),
    });
    setWeightSlabs(parseWeightSlabs(rate.weightSlabs));
    setShowModal(true);
  };

  const resetForm = () => {
    setEditing(null);
    setForm(defaultForm);
    setWeightSlabs([]);
    setShowModal(false);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const normalizedSlabs = weightSlabs
        .filter((slab) => slab.minWeight || slab.maxWeight || slab.cost)
        .map((slab) => {
          if (!slab.minWeight || !slab.cost) {
            throw new Error("Each weight slab needs Min Weight and Cost");
          }
          const minWeight = Number(slab.minWeight);
          const maxWeight = slab.maxWeight ? Number(slab.maxWeight) : null;
          const cost = Number(slab.cost);

          if (!Number.isFinite(minWeight) || minWeight < 0) {
            throw new Error("Min Weight must be a non-negative number");
          }
          if (maxWeight !== null && (!Number.isFinite(maxWeight) || maxWeight <= minWeight)) {
            throw new Error("Max Weight must be greater than Min Weight");
          }
          if (!Number.isFinite(cost) || cost < 0) {
            throw new Error("Cost must be a non-negative number");
          }

          return { minWeight, maxWeight, cost };
        });

      let weightSlabsPayload: unknown = null;
      if (normalizedSlabs.length > 0) {
        weightSlabsPayload = normalizedSlabs;
      }

      if (weightSlabsPayload === null && Number(form.baseCost) <= 0) {
        throw new Error("Set Base Cost or add at least one Weight Slab");
      }

      if (!Number.isFinite(Number(form.priority))) {
        throw new Error("Priority must be a number");
      }
      if (!Number.isFinite(Number(form.baseCost)) || Number(form.baseCost) < 0) {
        throw new Error("Base Cost must be a non-negative number");
      }
      if (form.freeMinOrder && (!Number.isFinite(Number(form.freeMinOrder)) || Number(form.freeMinOrder) < 0)) {
        throw new Error("Free Shipping Min Order must be a non-negative number");
      }

      const payload = {
        country: form.country.trim().toUpperCase(),
        area: form.area.trim(),
        baseCost: Number(form.baseCost),
        weightSlabs: weightSlabsPayload,
        freeMinOrder: form.freeMinOrder ? Number(form.freeMinOrder) : null,
        isActive: form.isActive,
        priority: Number(form.priority),
      };

      if (!payload.country) {
        throw new Error("Country is required");
      }
      if (!payload.area) {
        throw new Error("Area is required");
      }

      const url = editing
        ? `/api/admin/shipping-rates/${editing.id}`
        : "/api/admin/shipping-rates";
      const method = editing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save shipping rate");

      setSuccess(editing ? "Shipping rate updated" : "Shipping rate created");
      resetForm();
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save shipping rate");
    } finally {
      setSubmitting(false);
    }
  };

  const addWeightSlabRow = () => {
    setWeightSlabs((prev) => [...prev, { minWeight: "", maxWeight: "", cost: "" }]);
  };

  const updateWeightSlabRow = (
    index: number,
    field: keyof WeightSlabInput,
    value: string,
  ) => {
    setWeightSlabs((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const removeWeightSlabRow = (index: number) => {
    setWeightSlabs((prev) => prev.filter((_, i) => i !== index));
  };

  const removeRate = async (rate: ShippingRate) => {
    if (!confirm(`Delete shipping rate #${rate.id}?`)) return;

    setError(null);
    setSuccess(null);
    const res = await fetch(`/api/admin/shipping-rates/${rate.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || "Failed to delete shipping rate");
      return;
    }

    if (editing?.id === rate.id) resetForm();
    setSuccess("Shipping rate deleted");
    await loadData();
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Shipping Rates</h1>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary px-4 py-2 rounded inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Shipping Rate
        </button>
      </div>
      {/* Shipping Rate Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="card-theme border rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">
                {editing ? "Edit Shipping Rate" : "Add Shipping Rate"}
              </h2>
              <button
                type="button"
                onClick={resetForm}
                className="h-8 w-8 rounded-md border border-border bg-background hover:bg-muted flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm">
                  Country
                  <select
                    className="input-theme border p-2 rounded w-full mt-1"
                    value={form.country}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, country: e.target.value, area: "" }))
                    }
                    required
                  >
                    <option value="">
                      {loadingCountries ? "Loading countries..." : "Select country"}
                    </option>
                    {countryOptions}
                  </select>
                </label>
                <label className="text-sm">
                  Area
                  <select
                    className="input-theme border p-2 rounded w-full mt-1"
                    value={form.area}
                    onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
                    required
                  >
                    {ALLOWED_SHIPPING_AREAS.map((areaOption) => (
                      <option key={areaOption} value={areaOption}>
                        {areaOption}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="text-sm">
                  Base Cost
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-theme border p-2 rounded w-full mt-1"
                    placeholder="60"
                    value={form.baseCost}
                    onChange={(e) => setForm((f) => ({ ...f, baseCost: e.target.value }))}
                    required
                  />
                </label>
                <label className="text-sm">
                  Free Shipping Min Order (Optional)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-theme border p-2 rounded w-full mt-1"
                    placeholder="1000"
                    value={form.freeMinOrder}
                    onChange={(e) => setForm((f) => ({ ...f, freeMinOrder: e.target.value }))}
                  />
                </label>
                <label className="text-sm">
                  Priority (Lower = Stronger)
                  <input
                    type="number"
                    className="input-theme border p-2 rounded w-full mt-1"
                    placeholder="1000"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Weight Based Charges (Optional)</label>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1 rounded text-sm"
                    onClick={addWeightSlabRow}
                  >
                    Add Weight Slab
                  </button>
                </div>
                {weightSlabs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No slabs added. System will use Base Cost.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {weightSlabs.map((slab, index) => (
                      <div
                        key={`slab-${index}`}
                        className="grid grid-cols-1 md:grid-cols-4 gap-2 border rounded p-2"
                      >
                        <label className="text-xs">
                          Min Weight (grams)
                          <input
                            type="number"
                            min="0"
                            className="input-theme border p-2 rounded w-full mt-1"
                            placeholder="0"
                            value={slab.minWeight}
                            onChange={(e) => updateWeightSlabRow(index, "minWeight", e.target.value)}
                          />
                        </label>
                        <label className="text-xs">
                          Max Weight (grams, Optional)
                          <input
                            type="number"
                            min="0"
                            className="input-theme border p-2 rounded w-full mt-1"
                            placeholder="1000"
                            value={slab.maxWeight}
                            onChange={(e) => updateWeightSlabRow(index, "maxWeight", e.target.value)}
                          />
                        </label>
                        <label className="text-xs">
                          Charge
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input-theme border p-2 rounded w-full mt-1"
                            placeholder="60"
                            value={slab.cost}
                            onChange={(e) => updateWeightSlabRow(index, "cost", e.target.value)}
                          />
                        </label>
                        <div className="flex items-end">
                          <button
                            type="button"
                            className="btn-danger px-3 py-2 rounded text-sm w-full"
                            onClick={() => removeWeightSlabRow(index)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Active
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && <p className="text-sm text-green-700">{success}</p>}

              <div className="flex gap-2 pt-4 border-t">
                <button
                  type="button"
                  className="btn-secondary px-4 py-2 rounded"
                  onClick={resetForm}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : editing ? "Update Rate" : "Create Rate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card-theme border rounded-lg p-4 space-y-3">
        {loading ? (
          <ShippingRatesSkeleton />
        ) : rates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shipping rates found.</p>
        ) : (
          shippingRateItems
        )}
      </div>
    </div>
  );
}
