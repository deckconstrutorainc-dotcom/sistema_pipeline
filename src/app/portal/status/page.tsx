import { RequestStatusLookupForm } from "@/components/forms/request-status-lookup-form";

export default function PortalStatusPage() {
  return (
    <main className="mx-auto min-h-screen max-w-xl space-y-6 px-4 py-12">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Acompanhar solicitação</h1>
        <p className="text-muted-foreground">
          Informe o protocolo recebido no envio da sua solicitação para consultar o status.
        </p>
      </div>
      <RequestStatusLookupForm />
    </main>
  );
}
