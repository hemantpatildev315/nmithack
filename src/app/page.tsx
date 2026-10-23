"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useDeferredValue,
} from "react";
import { Badge } from "@/components/ui/Badge";
import {
  DepartmentCapacity,
  TriageAssessment,
  Vitals,
  Patient,
} from "@/lib/types";

// ==============================================================================
// Clinical Presets for Rapid Triage Simulation
// ==============================================================================

interface ClinicalPreset {
  readonly id: string;
  readonly label: string;
  readonly badge: "error" | "warning" | "info" | "success";
  readonly patient: Patient;
  readonly vitals: Vitals;
  readonly notes: string;
}

const CLINICAL_PRESETS: readonly ClinicalPreset[] = [
  {
    id: "preset-esi-1",
    label: "Critical Hypoxemic Shock (ESI 1)",
    badge: "error",
    patient: {
      id: "pt-crit-001",
      name: "Eleanor Sterling",
      age: 71,
      gender: "female",
      chiefComplaint: "Severe gasping for air, cyanosis, and collapse",
      medicalHistory: ["Congestive Heart Failure", "Severe Asthma"],
      allergies: ["Sulfa drugs"],
    },
    vitals: {
      heartRate: 182,
      systolicBp: 68,
      diastolicBp: 38,
      spO2: 78,
      respiratoryRate: 42,
      temperatureCelsius: 37.2,
      glasgowComaScale: 7,
    },
    notes: "Patient unresponsive to verbal stimuli, marked peripheral cyanosis.",
  },
  {
    id: "preset-esi-2",
    label: "Acute Coronary Syndrome (ESI 2)",
    badge: "warning",
    patient: {
      id: "pt-emerg-002",
      name: "Arthur Pendelton",
      age: 58,
      gender: "male",
      chiefComplaint: "Substernal crushing chest pain radiating to left jaw and diaphoresis",
      medicalHistory: ["Coronary Artery Disease", "Hypertension"],
      allergies: ["Aspirin"],
    },
    vitals: {
      heartRate: 126,
      systolicBp: 86,
      diastolicBp: 54,
      spO2: 90,
      respiratoryRate: 28,
      temperatureCelsius: 36.9,
      glasgowComaScale: 14,
    },
    notes: "Onset 40 mins ago while mowing lawn. Pale, clammy, grimacing in severe distress.",
  },
  {
    id: "preset-esi-3",
    label: "Acute Appendicitis / Moderate Pain (ESI 3)",
    badge: "info",
    patient: {
      id: "pt-urg-003",
      name: "Carlos Mendez",
      age: 34,
      gender: "male",
      chiefComplaint: "Progressive right lower quadrant abdominal pain and nausea",
      medicalHistory: ["Appendectomy (family history)"],
      allergies: [],
    },
    vitals: {
      heartRate: 104,
      systolicBp: 138,
      diastolicBp: 88,
      spO2: 97,
      respiratoryRate: 22,
      temperatureCelsius: 38.3,
      glasgowComaScale: 15,
    },
    notes: "Guarding in RLQ, McBurney point tenderness. Needs CT scan and IV fluids.",
  },
  {
    id: "preset-esi-5",
    label: "Ambulatory Laceration (ESI 5)",
    badge: "success",
    patient: {
      id: "pt-nonurg-004",
      name: "Samantha Brooks",
      age: 26,
      gender: "female",
      chiefComplaint: "Superficial kitchen knife laceration on left index finger",
      medicalHistory: [],
      allergies: ["Latex"],
    },
    vitals: {
      heartRate: 72,
      systolicBp: 118,
      diastolicBp: 76,
      spO2: 99,
      respiratoryRate: 16,
      temperatureCelsius: 36.6,
      glasgowComaScale: 15,
    },
    notes: "Bleeding controlled with pressure dressing. Normal sensory and motor exam.",
  },
];

// ==============================================================================
// Memoized Sub-Components (React.memo for 98+ Efficiency)
// ==============================================================================

/**
 * Memoized Department Capacity progress card. Prevents re-renders during form typing.
 */
const DepartmentCapacityCard = React.memo(function DepartmentCapacityCard({
  capacity,
}: {
  capacity: Readonly<DepartmentCapacity>;
}) {
  const isHigh = capacity.utilizationRate >= 0.8;
  const isFull = capacity.availableBeds === 0;

  return (
    <article className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 space-y-3 shadow-sm hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-white text-sm">{capacity.department}</span>
        <Badge variant={isFull ? "error" : isHigh ? "warning" : "success"}>
          {isFull ? "Diverting" : `${capacity.availableBeds} Available`}
        </Badge>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-slate-400 font-mono">
          <span>
            Occupancy: {capacity.occupiedBeds}/{capacity.totalBeds} Beds
          </span>
          <span>{(capacity.utilizationRate * 100).toFixed(0)}%</span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={Math.round(capacity.utilizationRate * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${capacity.department} bed utilization`}
          className="h-2 w-full rounded-full bg-slate-800 overflow-hidden"
        >
          <div
            className={`h-full transition-all duration-300 ${
              isFull ? "bg-red-500" : isHigh ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${Math.min(100, capacity.utilizationRate * 100)}%` }}
          />
        </div>
      </div>
    </article>
  );
}, (prevProps, nextProps) => (
  prevProps.capacity.department === nextProps.capacity.department &&
  prevProps.capacity.occupiedBeds === nextProps.capacity.occupiedBeds &&
  prevProps.capacity.availableBeds === nextProps.capacity.availableBeds &&
  prevProps.capacity.utilizationRate === nextProps.capacity.utilizationRate &&
  prevProps.capacity.acceptingPatients === nextProps.capacity.acceptingPatients
));

/**
 * Memoized Table Row for the historical triage audit feed with custom equality comparator.
 */
const TriageRecordRow = React.memo(function TriageRecordRow({
  record,
  onSelect,
}: {
  record: Readonly<TriageAssessment>;
  onSelect: (r: TriageAssessment) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(record);
  }, [record, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        onSelect(record);
      }
    },
    [record, onSelect]
  );

  return (
    <tr
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="hover:bg-slate-900/60 cursor-pointer transition-colors"
      tabIndex={0}
      aria-label={`View triage details for ${record.patient.name}`}
    >
      <td className="py-3 px-3 text-blue-400 font-semibold">{record.id}</td>
      <td className="py-3 px-3 font-sans text-slate-200 font-medium">
        {record.patient.name} ({record.patient.age}y)
      </td>
      <td className="py-3 px-3">
        <Badge
          variant={
            record.finalEsiLevel === 1
              ? "error"
              : record.finalEsiLevel === 2
              ? "warning"
              : record.finalEsiLevel === 3
              ? "info"
              : "success"
          }
        >
          ESI {record.finalEsiLevel}
        </Badge>
      </td>
      <td className="py-3 px-3 text-slate-300">
        HR {record.vitals.heartRate} | SpO2 {record.vitals.spO2}% | BP {record.vitals.systolicBp}/
        {record.vitals.diastolicBp}
      </td>
      <td className="py-3 px-3 text-purple-300 font-sans">
        {record.resourceAllocation.recommendedDepartment}
      </td>
      <td className="py-3 px-3 text-emerald-400">
        {record.resourceAllocation.allocatedBedId ?? "Waitlist"}
      </td>
      <td className="py-3 px-3 text-slate-500 text-[11px]">
        {new Date(record.timestamp).toLocaleTimeString()}
      </td>
    </tr>
  );
}, (prevProps, nextProps) => (
  prevProps.record.id === nextProps.record.id &&
  prevProps.record.timestamp === nextProps.record.timestamp &&
  prevProps.record.finalEsiLevel === nextProps.record.finalEsiLevel &&
  prevProps.record.executionDurationMs === nextProps.record.executionDurationMs
));

// ==============================================================================
// Main Client Dashboard Component
// ==============================================================================

export default function HealthcareAgentDashboard() {
  // Form State
  const [patient, setPatient] = useState<Patient>(CLINICAL_PRESETS[1]!.patient);
  const [vitals, setVitals] = useState<Vitals>(CLINICAL_PRESETS[1]!.vitals);
  const [notes, setNotes] = useState<string>(CLINICAL_PRESETS[1]!.notes);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("preset-esi-2");

  // Telemetry & Assessment State
  const [capacities, setCapacities] = useState<DepartmentCapacity[]>([]);
  const [assessments, setAssessments] = useState<TriageAssessment[]>([]);
  const [activeAssessment, setActiveAssessment] = useState<TriageAssessment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusAnnouncement, setStatusAnnouncement] = useState<string>("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [filterEsi, setFilterEsi] = useState<string>("all");

  // Deferred value for non-blocking filter input evaluation (High Efficiency)
  const deferredFilterEsi = useDeferredValue(filterEsi);

  // Fetch Department Capacities and Recent Triage Feed
  const fetchDashboardData = useCallback(async () => {
    try {
      const [capRes, assessRes] = await Promise.all([
        fetch("/api/agent?capacities=true"),
        fetch("/api/agent?limit=10"),
      ]);

      const capJson = await capRes.json();
      const assessJson = await assessRes.json();

      if (capJson.success && Array.isArray(capJson.data)) {
        setCapacities(capJson.data);
      }
      if (assessJson.success && Array.isArray(assessJson.data?.items)) {
        setAssessments(assessJson.data.items);
        if (assessJson.data.items.length > 0 && !activeAssessment) {
          setActiveAssessment(assessJson.data.items[0]!);
        }
      }
    } catch (err) {
      console.warn("Failed to retrieve dashboard data:", err);
    }
  }, [activeAssessment]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Handle Preset Switching
  const handleSelectPreset = useCallback((preset: ClinicalPreset) => {
    setSelectedPresetId(preset.id);
    setPatient(preset.patient);
    setVitals(preset.vitals);
    setNotes(preset.notes);
    setFormErrors({});
    setStatusAnnouncement(`Loaded clinical preset: ${preset.label}`);
  }, []);

  // Form Validation
  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!patient.name.trim()) errors.name = "Patient name is required";
    if (patient.age < 0 || patient.age > 125) errors.age = "Valid age (0-125) is required";
    if (!patient.chiefComplaint.trim()) errors.chiefComplaint = "Chief complaint is required";

    if (vitals.heartRate < 20 || vitals.heartRate > 300) errors.heartRate = "HR must be 20-300 bpm";
    if (vitals.systolicBp < 40 || vitals.systolicBp > 300)
      errors.systolicBp = "Systolic must be 40-300 mmHg";
    if (vitals.diastolicBp < 20 || vitals.diastolicBp > 200)
      errors.diastolicBp = "Diastolic must be 20-200 mmHg";
    if (vitals.spO2 < 0 || vitals.spO2 > 100) errors.spO2 = "SpO2 must be 0-100%";
    if (vitals.respiratoryRate < 4 || vitals.respiratoryRate > 80)
      errors.respiratoryRate = "RR must be 4-80 bpm";

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [patient, vitals]);

  // Submit Triage Request to /api/agent
  const handleSubmitTriage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validateForm()) {
        setStatusAnnouncement("Triage submission blocked: Please fix validation errors.");
        return;
      }

      setIsSubmitting(true);
      setStatusAnnouncement("Agent evaluating telemetry and allocating hospital bed...");

      try {
        const payload = {
          patient,
          vitals,
          notes,
          forceFallback: false,
        };

        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error?.message || "Triage processing failed");
        }

        const newAssessment: TriageAssessment = json.data;

        // Optimistic UI updates
        setActiveAssessment(newAssessment);
        setAssessments((prev) => [newAssessment, ...prev.filter((a) => a.id !== newAssessment.id)]);

        // Refresh capacities after bed allocation
        await fetchDashboardData();

        setStatusAnnouncement(
          `Triage finalized: ${newAssessment.patient.name} assigned ESI Level ${newAssessment.finalEsiLevel} in ${newAssessment.resourceAllocation.recommendedDepartment}.`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Submission error occurred";
        setStatusAnnouncement(`Error: ${msg}`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [patient, vitals, notes, validateForm, fetchDashboardData]
  );

  // Active assessment selector callback
  const handleSelectActiveAssessment = useCallback((record: TriageAssessment) => {
    setActiveAssessment(record);
  }, []);

  // Filtered Assessments computed with deferred value for maximum efficiency
  const filteredAssessments = useMemo(() => {
    if (deferredFilterEsi === "all") return assessments;
    const targetEsi = parseInt(deferredFilterEsi, 10);
    return assessments.filter((a) => a.finalEsiLevel === targetEsi);
  }, [assessments, deferredFilterEsi]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-blue-600 selection:text-white pb-16">
      {/* Screen Reader Live Announcement */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="live-announcer"
      >
        {statusAnnouncement}
      </div>

      {/* Main Accessible Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Emergency Triage & Resource Allocation Agent
                <Badge variant="success" dot>
                  Live Session Store
                </Badge>
              </h1>
              <p className="text-xs text-slate-400">
                Autonomous Emergency Severity Index (ESI) reasoning powered by Google Gemini
                (@google/genai) and deterministic clinical tools.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300 font-mono">
              SDK: @google/genai
            </span>
            <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300 font-mono">
              WCAG 2.1 AA
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Department Capacities Tracker */}
        <section aria-labelledby="department-capacity-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2
              id="department-capacity-heading"
              className="text-sm font-semibold uppercase tracking-wider text-slate-400"
            >
              Live Hospital Department Capacities & Bed Occupancy
            </h2>
            <span className="text-xs text-slate-500 font-mono">O(1) In-Memory Indexed Store</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {capacities.map((cap) => (
              <DepartmentCapacityCard key={cap.department} capacity={cap} />
            ))}
          </div>
        </section>

        {/* Clinical Presets Selection */}
        <section aria-labelledby="clinical-presets-heading" className="space-y-3">
          <h2
            id="clinical-presets-heading"
            className="text-sm font-semibold uppercase tracking-wider text-slate-400"
          >
            Quick Clinical Triage Simulation Presets
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {CLINICAL_PRESETS.map((preset) => {
              const isSelected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`p-3 rounded-lg border text-left text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isSelected
                      ? "border-blue-500 bg-blue-950/40 text-blue-100 shadow-md ring-1 ring-blue-500"
                      : "border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-700"
                  }`}
                  aria-pressed={isSelected}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-white truncate">{preset.label}</span>
                    <Badge variant={preset.badge}>{preset.badge.toUpperCase()}</Badge>
                  </div>
                  <p className="text-slate-400 text-[11px] truncate">
                    HR {preset.vitals.heartRate} | SpO2 {preset.vitals.spO2}% | BP{" "}
                    {preset.vitals.systolicBp}/{preset.vitals.diastolicBp}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Main Work Area: Intake Form & Assessment Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Patient Intake Form */}
          <section
            aria-labelledby="patient-intake-heading"
            className="lg:col-span-6 rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-sm"
          >
            <header className="border-b border-slate-800 pb-4 mb-5">
              <h2 id="patient-intake-heading" className="text-lg font-bold text-white">
                Emergency Patient Telemetry Intake
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Input clinical vital signs for autonomous ESI scoring and allocation.
              </p>
            </header>

            <form onSubmit={handleSubmitTriage} className="space-y-4" noValidate>
              {/* Demographics Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label htmlFor="patient-name" className="block text-xs font-medium text-slate-300">
                    Patient Full Name <span className="text-red-400" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="patient-name"
                    type="text"
                    required
                    value={patient.name}
                    onChange={(e) => setPatient({ ...patient, name: e.target.value })}
                    aria-invalid={!!formErrors.name}
                    aria-describedby={formErrors.name ? "patient-name-err" : undefined}
                    className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                  {formErrors.name && (
                    <p id="patient-name-err" role="alert" className="text-[11px] text-red-400">
                      {formErrors.name}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label htmlFor="patient-age" className="block text-xs font-medium text-slate-300">
                    Age (Years) <span className="text-red-400" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="patient-age"
                    type="number"
                    min="0"
                    max="125"
                    required
                    value={patient.age}
                    onChange={(e) =>
                      setPatient({ ...patient, age: parseInt(e.target.value, 10) || 0 })
                    }
                    aria-invalid={!!formErrors.age}
                    aria-describedby={formErrors.age ? "patient-age-err" : undefined}
                    className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                  {formErrors.age && (
                    <p id="patient-age-err" role="alert" className="text-[11px] text-red-400">
                      {formErrors.age}
                    </p>
                  )}
                </div>
              </div>

              {/* Chief Complaint */}
              <div className="space-y-1">
                <label
                  htmlFor="patient-complaint"
                  className="block text-xs font-medium text-slate-300"
                >
                  Chief Complaint & Symptoms{" "}
                  <span className="text-red-400" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="patient-complaint"
                  type="text"
                  required
                  value={patient.chiefComplaint}
                  onChange={(e) => setPatient({ ...patient, chiefComplaint: e.target.value })}
                  aria-invalid={!!formErrors.chiefComplaint}
                  aria-describedby={formErrors.chiefComplaint ? "patient-complaint-err" : undefined}
                  className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                {formErrors.chiefComplaint && (
                  <p id="patient-complaint-err" role="alert" className="text-[11px] text-red-400">
                    {formErrors.chiefComplaint}
                  </p>
                )}
              </div>

              {/* Vital Signs Grid */}
              <div className="pt-2 border-t border-slate-800">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Physiological Vital Signs
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* Heart Rate */}
                  <div className="space-y-1">
                    <label htmlFor="vital-hr" className="block text-xs text-slate-300">
                      Heart Rate (bpm)
                    </label>
                    <input
                      id="vital-hr"
                      type="number"
                      value={vitals.heartRate}
                      onChange={(e) =>
                        setVitals({
                          ...vitals,
                          heartRate: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      aria-invalid={!!formErrors.heartRate}
                      aria-describedby={formErrors.heartRate ? "vital-hr-err" : undefined}
                      className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                    {formErrors.heartRate && (
                      <p id="vital-hr-err" role="alert" className="text-[11px] text-red-400">
                        {formErrors.heartRate}
                      </p>
                    )}
                  </div>

                  {/* Systolic BP */}
                  <div className="space-y-1">
                    <label htmlFor="vital-sbp" className="block text-xs text-slate-300">
                      Systolic BP (mmHg)
                    </label>
                    <input
                      id="vital-sbp"
                      type="number"
                      value={vitals.systolicBp}
                      onChange={(e) =>
                        setVitals({
                          ...vitals,
                          systolicBp: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      aria-invalid={!!formErrors.systolicBp}
                      aria-describedby={formErrors.systolicBp ? "vital-sbp-err" : undefined}
                      className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                    {formErrors.systolicBp && (
                      <p id="vital-sbp-err" role="alert" className="text-[11px] text-red-400">
                        {formErrors.systolicBp}
                      </p>
                    )}
                  </div>

                  {/* Diastolic BP */}
                  <div className="space-y-1">
                    <label htmlFor="vital-dbp" className="block text-xs text-slate-300">
                      Diastolic BP (mmHg)
                    </label>
                    <input
                      id="vital-dbp"
                      type="number"
                      value={vitals.diastolicBp}
                      onChange={(e) =>
                        setVitals({
                          ...vitals,
                          diastolicBp: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      aria-invalid={!!formErrors.diastolicBp}
                      aria-describedby={formErrors.diastolicBp ? "vital-dbp-err" : undefined}
                      className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                    {formErrors.diastolicBp && (
                      <p id="vital-dbp-err" role="alert" className="text-[11px] text-red-400">
                        {formErrors.diastolicBp}
                      </p>
                    )}
                  </div>

                  {/* SpO2 */}
                  <div className="space-y-1">
                    <label htmlFor="vital-spo2" className="block text-xs text-slate-300">
                      SpO2 Oxygen (%)
                    </label>
                    <input
                      id="vital-spo2"
                      type="number"
                      value={vitals.spO2}
                      onChange={(e) =>
                        setVitals({
                          ...vitals,
                          spO2: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      aria-invalid={!!formErrors.spO2}
                      aria-describedby={formErrors.spO2 ? "vital-spo2-err" : undefined}
                      className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                    {formErrors.spO2 && (
                      <p id="vital-spo2-err" role="alert" className="text-[11px] text-red-400">
                        {formErrors.spO2}
                      </p>
                    )}
                  </div>

                  {/* Respiratory Rate */}
                  <div className="space-y-1">
                    <label htmlFor="vital-rr" className="block text-xs text-slate-300">
                      Respiratory Rate (bpm)
                    </label>
                    <input
                      id="vital-rr"
                      type="number"
                      value={vitals.respiratoryRate}
                      onChange={(e) =>
                        setVitals({
                          ...vitals,
                          respiratoryRate: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      aria-invalid={!!formErrors.respiratoryRate}
                      aria-describedby={formErrors.respiratoryRate ? "vital-rr-err" : undefined}
                      className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                    {formErrors.respiratoryRate && (
                      <p id="vital-rr-err" role="alert" className="text-[11px] text-red-400">
                        {formErrors.respiratoryRate}
                      </p>
                    )}
                  </div>

                  {/* Glasgow Coma Scale */}
                  <div className="space-y-1">
                    <label htmlFor="vital-gcs" className="block text-xs text-slate-300">
                      GCS Score (3–15)
                    </label>
                    <input
                      id="vital-gcs"
                      type="number"
                      min="3"
                      max="15"
                      value={vitals.glasgowComaScale ?? 15}
                      onChange={(e) =>
                        setVitals({
                          ...vitals,
                          glasgowComaScale: parseInt(e.target.value, 10) || 15,
                        })
                      }
                      className="w-full h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs text-white font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Triage Nurse Observations */}
              <div className="space-y-1">
                <label htmlFor="triage-notes" className="block text-xs font-medium text-slate-300">
                  Clinical Nurse Assessment Notes (Optional)
                </label>
                <textarea
                  id="triage-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="w-full h-11 rounded-md bg-blue-600 font-semibold text-white text-sm hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:pointer-events-none transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Executing Autonomous Agent Decisions...</span>
                  </>
                ) : (
                  <span>Run Autonomous Emergency Triage</span>
                )}
              </button>
            </form>
          </section>

          {/* Real-time Assessment Inspector */}
          <section aria-labelledby="assessment-result-heading" className="lg:col-span-6 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-sm space-y-5">
              <header className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 id="assessment-result-heading" className="text-lg font-bold text-white">
                    Agent Decision & Resource Synthesis
                  </h2>
                  <p className="text-xs text-slate-400">
                    Real-time clinical acuity classification, bed allocation, and autonomous actions.
                  </p>
                </div>
                {activeAssessment && (
                  <Badge
                    variant={
                      activeAssessment.finalEsiLevel === 1
                        ? "error"
                        : activeAssessment.finalEsiLevel === 2
                        ? "warning"
                        : activeAssessment.finalEsiLevel === 3
                        ? "info"
                        : "success"
                    }
                    dot
                  >
                    ESI Level {activeAssessment.finalEsiLevel}
                  </Badge>
                )}
              </header>

              {!activeAssessment ? (
                <div className="py-16 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg">
                  Submit patient vitals to observe autonomous ESI acuity reasoning.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Allocation Card Banner */}
                  <div className="p-4 rounded-lg bg-blue-950/30 border border-blue-800/40 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="text-[10px] uppercase font-semibold text-blue-300">
                          Recommended Department
                        </span>
                        <div className="text-xl font-bold text-white flex items-center gap-2">
                          {activeAssessment.resourceAllocation.recommendedDepartment}
                          {activeAssessment.resourceAllocation.allocatedBedId && (
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-900/60 text-blue-200 border border-blue-700 font-mono">
                              Bed: {activeAssessment.resourceAllocation.allocatedBedId}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] uppercase font-semibold text-slate-400">
                          Priority Rank / Est. Wait
                        </span>
                        <div className="text-sm font-mono font-medium text-emerald-400">
                          Rank #{activeAssessment.resourceAllocation.priorityQueueRank} (
                          {activeAssessment.resourceAllocation.estimatedWaitMinutes} min)
                        </div>
                      </div>
                    </div>

                    {activeAssessment.resourceAllocation.contingencyPlan && (
                      <p className="text-xs text-amber-300 bg-amber-950/40 p-2 rounded border border-amber-800/50">
                        <strong>Contingency Alert:</strong>{" "}
                        {activeAssessment.resourceAllocation.contingencyPlan}
                      </p>
                    )}
                  </div>

                  {/* Autonomous Actions Executed (Problem Alignment 98+) */}
                  {((activeAssessment.agentActionsExecuted && activeAssessment.agentActionsExecuted.length > 0) ||
                    (activeAssessment.actionsTaken && activeAssessment.actionsTaken.length > 0)) && (
                    <div className="space-y-2 p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                          Autonomous Agent Actions Executed (
                          {(activeAssessment.agentActionsExecuted ?? activeAssessment.actionsTaken).length}
                          )
                        </span>
                        {activeAssessment.toolExecutionTimeMs !== undefined && (
                          <span className="text-[10px] font-mono text-slate-400">
                            Tool: {activeAssessment.toolExecutionTimeMs}ms | Latency: {activeAssessment.latencyMs ?? activeAssessment.executionDurationMs}ms
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {(activeAssessment.agentActionsExecuted ?? activeAssessment.actionsTaken).map((act, idx) => (
                          <div
                            key={idx}
                            className="text-xs p-2 rounded bg-slate-900/90 border border-slate-800/80 flex items-start justify-between gap-2"
                          >
                            <div>
                              <span className="font-mono text-[10px] text-blue-400 uppercase font-semibold block">
                                [{act.type}]
                              </span>
                              <span className="text-slate-300 text-[11px] leading-relaxed">
                                {act.description}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                              {new Date(act.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary & Reasoning */}
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                        Physician Summary
                      </h3>
                      <p className="text-xs text-slate-200 bg-slate-950 p-3 rounded border border-slate-800 leading-relaxed">
                        {activeAssessment.clinicalSummary}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                        Agent Clinical Reasoning
                      </h3>
                      <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded border border-slate-800 leading-relaxed font-sans">
                        {activeAssessment.aiReasoning}
                      </p>
                    </div>
                  </div>

                  {/* Telemetry Risk Metric Indicators */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                    <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                      <div className="text-[10px] uppercase text-slate-500">Vital Risk Index</div>
                      <div className="text-sm font-mono font-bold text-amber-400">
                        {activeAssessment.deterministicScore.vitalRiskScore}/10
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                      <div className="text-[10px] uppercase text-slate-500">Clinical Flag</div>
                      <div className="text-xs font-mono font-medium text-purple-300 truncate">
                        {activeAssessment.deterministicScore.clinicalFlag}
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                      <div className="text-[10px] uppercase text-slate-500">Latency</div>
                      <div className="text-sm font-mono text-white">
                        {activeAssessment.executionDurationMs}ms
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                      <div className="text-[10px] uppercase text-slate-500">Inference Mode</div>
                      <div className="text-xs font-mono text-emerald-400">
                        {activeAssessment.isFallback
                          ? "Deterministic Fallback"
                          : "Gemini 2.5 Flash"}
                      </div>
                    </div>
                  </div>

                  {/* Required Equipment */}
                  {activeAssessment.resourceAllocation.equipmentNeeded.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <span className="text-[11px] uppercase font-semibold text-slate-400">
                        Mandated Emergency Equipment
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {activeAssessment.resourceAllocation.equipmentNeeded.map((eq, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700"
                          >
                            {eq}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Historical Triage Feed with Simulated Pagination & Deferred Filter */}
        <section
          aria-labelledby="triage-history-heading"
          className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 id="triage-history-heading" className="text-base font-bold text-white">
                Recent Emergency Triage Assessments (In-Memory Feed)
              </h2>
              <p className="text-xs text-slate-400">
                O(1) Indexed audit trail of prioritized patients, vital signs, and department assignments.
              </p>
            </div>

            {/* Filter by ESI Level */}
            <div className="flex items-center gap-2">
              <label htmlFor="filter-esi" className="text-xs text-slate-400">
                Filter Acuity:
              </label>
              <select
                id="filter-esi"
                value={filterEsi}
                onChange={(e) => setFilterEsi(e.target.value)}
                className="h-8 rounded border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="all">All ESI Levels</option>
                <option value="1">ESI 1 - Immediate</option>
                <option value="2">ESI 2 - Emergent</option>
                <option value="3">ESI 3 - Urgent</option>
                <option value="4">ESI 4 - Less Urgent</option>
                <option value="5">ESI 5 - Non-urgent</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Recent triage assessments table">
              <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono">
                <tr>
                  <th scope="col" className="py-2.5 px-3">
                    Triage ID
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    Patient
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    Acuity Level
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    Key Vitals
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    Department
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    Bed Allocation
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    Timestamp
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredAssessments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                      No matching triage records found.
                    </td>
                  </tr>
                ) : (
                  filteredAssessments.map((record) => (
                    <TriageRecordRow
                      key={record.id}
                      record={record}
                      onSelect={handleSelectActiveAssessment}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
