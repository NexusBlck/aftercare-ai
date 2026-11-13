"use client";

import { ChevronLeft, ChevronRight, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useClinic } from "@/components/clinic/clinic-context";
import { ClinicPageHeader, EmptyState, ErrorState, formatDate, LoadingRows, NativeSelect, Pill } from "@/components/clinic/ui";
import { useApi } from "@/components/clinic/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PatientList {
  patients: Array<{
    id: string;
    full_name: string;
    mrn: string | null;
    date_of_birth: string;
    status: "active" | "archived";
    linked_at: string | null;
    created_at: string;
    plans: Array<{ id: string; approved_version_id: string | null }>;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export default function PatientsPage() {
  const { can } = useClinic();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams({ status, page: String(page), ...(debounced ? { q: debounced } : {}) });
  const { data, error, loading, reload } = useApi<PatientList>(`/api/clinic/patients?${params}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <ClinicPageHeader
        title="Patients"
        description="Everyone registered with your clinic. Search by name or clinic reference."
        actions={
          can("patients.write") && (
            <Button asChild>
              <Link href="/clinic/patients/new">
                <UserPlus aria-hidden /> Register patient
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or reference (MRN)" className="h-10 pl-9" aria-label="Search patients" maxLength={80} />
        </div>
        <NativeSelect value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-44" aria-label="Filter by status">
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </NativeSelect>
      </div>

      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <LoadingRows />}
      {data && data.patients.length === 0 && (
        <EmptyState
          title={debounced ? "No patients match your search" : "No patients registered yet"}
          description={debounced ? "Check the spelling or search by clinic reference." : "Registered patients will appear here."}
          action={
            !debounced && can("patients.write") ? (
              <Button asChild>
                <Link href="/clinic/patients/new">Register a patient</Link>
              </Button>
            ) : null
          }
        />
      )}
      {data && data.patients.length > 0 && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Patients</caption>
            <thead className="border-b bg-secondary/50 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Patient</th>
                <th scope="col" className="hidden px-4 py-3 font-semibold md:table-cell">Date of birth</th>
                <th scope="col" className="px-4 py-3 font-semibold">Plan</th>
                <th scope="col" className="hidden px-4 py-3 font-semibold sm:table-cell">Patient app</th>
                <th scope="col" className="hidden px-4 py-3 font-semibold lg:table-cell">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.patients.map((p) => {
                const approved = p.plans.some((pl) => pl.approved_version_id);
                return (
                  <tr key={p.id} className="hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <Link href={`/clinic/patients/${p.id}`} className="font-semibold hover:text-teal focus-visible:underline">
                        {p.full_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {p.mrn ? `Ref ${p.mrn}` : "No reference"}
                        {p.status === "archived" && " · Archived"}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">{formatDate(p.date_of_birth)}</td>
                    <td className="px-4 py-3">{approved ? <Pill tone="teal">Approved</Pill> : p.plans.length ? <Pill tone="amber">In preparation</Pill> : <Pill>None</Pill>}</td>
                    <td className="hidden px-4 py-3 sm:table-cell">{p.linked_at ? <Pill tone="teal">Linked</Pill> : <Pill>Not linked</Pill>}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{formatDate(p.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {data.total} {data.total === 1 ? "patient" : "patients"}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft aria-hidden />
              </Button>
              <span aria-live="polite">
                Page {page} of {pages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
