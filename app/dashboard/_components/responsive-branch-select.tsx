"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

type BranchOption = {
  id: string;
  name: string;
  meta?: string;
};

type Props = {
  branches: BranchOption[];
  selectedBranchId: string;
  includeAll?: boolean;
  allLabel?: string;
  queryKey?: string;
  onNavigate?: (branchId: string) => void;
  isNavigating?: boolean;
};

export function ResponsiveBranchSelect({
  branches,
  selectedBranchId,
  includeAll = false,
  allLabel = "All branches",
  queryKey = "branch",
  onNavigate,
  isNavigating = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const navigating = isPending || isNavigating;

  useEffect(() => {
    for (const branch of branches) {
      const params = new URLSearchParams();
      params.set(queryKey, branch.id);
      router.prefetch(`${pathname}?${params.toString()}`);
    }
    if (includeAll) {
      router.prefetch(`${pathname}?${queryKey}=all`);
    }
  }, [branches, includeAll, pathname, queryKey, router]);

  function navigate(branchId: string) {
    const params = new URLSearchParams();
    params.set(queryKey, branchId);
    if (onNavigate) {
      onNavigate(branchId);
      return;
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <label className="responsive-branch-select">
      <span>Branch</span>
      <select
        value={selectedBranchId}
        onChange={(event) => navigate(event.target.value)}
        disabled={navigating}
        aria-label="Select branch"
      >
        {includeAll ? <option value="all">{allLabel}</option> : null}
        {branches.map((branch) => (
          <option value={branch.id} key={branch.id}>
            {branch.name}
            {branch.meta ? ` — ${branch.meta}` : ""}
          </option>
        ))}
      </select>
      {navigating ? <small className="responsive-branch-select-status">Please wait...</small> : null}
    </label>
  );
}
