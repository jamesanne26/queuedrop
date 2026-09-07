import { redirect } from "next/navigation";

export default function ClientPage() {
  redirect("/dashboard/settings");
}
