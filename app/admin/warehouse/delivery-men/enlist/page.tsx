import DeliveryManEnlistmentForm from "@/components/delivery-men/DeliveryManEnlistmentForm";

export default function DeliveryMenEnlistPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <p className="rubik-medium text-sm text-muted-foreground">
            Warehouse Management / Delivery Team
          </p>
          <h1 className="rubik-bold mt-2 text-3xl tracking-tight">
            Delivery Man Enlistment Form
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
            Upload NID or Passport to auto-detect basic information, then complete the rest of the onboarding form.
          </p>
        </div>

        <DeliveryManEnlistmentForm />
      </div>
    </main>
  );
}
