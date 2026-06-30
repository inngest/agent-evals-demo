import { redirect } from "next/navigation";

export const metadata = {
  title: "Agent Evals Booth Demo",
};

export default function BoothControlPage() {
  redirect("/");
}
