"use client";

export function DeleteBranchButton({ branchName }: { branchName: string }) {
  return (
    <button
      className="button button-danger button-small"
      type="submit"
      onClick={(event) => {
        const confirmed = window.confirm(
          `Delete ${branchName}? Empty branches can be deleted permanently. Branches with queue history must be set to Inactive instead.`,
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      Delete branch
    </button>
  );
}
