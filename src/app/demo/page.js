import { redirect } from "next/navigation";

export const metadata = {
  title: "Demo NexaWi Clínicas",
  description: "Acesse a demonstração real do dashboard NexaWi Clínicas.",
};

export default function DemoPage() {
  redirect("/login-cliente?demo=1");
}
