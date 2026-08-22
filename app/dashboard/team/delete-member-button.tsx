"use client";

type Props = {
  memberName: string;
};

export function DeleteMemberButton({ memberName }: Props) {
  return (
    <button
      className="button button-danger button-small"
      type="submit"
      onClick={(event) => {
        const confirmed = window.confirm(
          `Delete ${memberName}? This removes their QueueDrop business access and may also delete their login account.`,
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      Delete user
    </button>
  );
}
