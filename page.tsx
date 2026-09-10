import Link from "next/link";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    blurb: "Core automation to get started",
  },
  {
    id: "lite",
    name: "Lite",
    price: "$19",
    blurb: "For individual professionals",
  },
  {
    id: "plus",
    name: "Plus",
    price: "$49",
    blurb: "Small teams",
  },
  {
    id: "premium",
    name: "Premium",
    price: "$200",
    blurb: "Growing businesses",
  },
];

export default function SettingsPage() {
  const paystackConfigured = Boolean(process.env.PAYSTACK_SECRET_KEY?.trim());

  return (
    <div className="max-w-3xl pb-20 lg:pb-0">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900 tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Workspace, plans, and security. Credentials never leave the server.
        </p>
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Onboarding</h2>
          <p className="mt-1 text-sm text-slate-500 leading-relaxed">
            ACET AI is an agent that gets business work done. Start with your
            company context, then connect the tools you need.
          </p>
          <ol className="mt-4 space-y-2 text-sm text-slate-600 list-decimal list-inside">
            <li>Describe your business and primary goals in an agent objective</li>
            <li>
              <Link
                href="/dashboard/integrations"
                className="text-acet-600 font-medium hover:underline"
              >
                Connect integrations
              </Link>{" "}
              (research, email, calendar)
            </li>
            <li>Run a first workflow from the workspace</li>
          </ol>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="text-sm font-semibold text-slate-900">
              Subscription
            </h2>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Paystack-ready
            </span>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Plans mirror the product database. Billing uses Paystack when
            configured — secrets stay server-side only.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PLANS.map((p) => (
              <div
                key={p.id}
                className={`rounded-lg border px-4 py-3 ${
                  p.id === "premium"
                    ? "border-acet-200 bg-acet-50/40"
                    : "border-slate-100 bg-slate-50/50"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                  <p className="text-sm font-medium text-slate-700">
                    {p.price}
                    <span className="text-xs text-slate-400 font-normal">
                      /mo
                    </span>
                  </p>
                </div>
                <p className="mt-1 text-xs text-slate-500">{p.blurb}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-xs text-slate-500">
            {paystackConfigured
              ? "Paystack secret is configured on the server. Checkout UI can be enabled when ready."
              : "Paystack is not configured. Set PAYSTACK_SECRET_KEY server-side before enabling billing."}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Integrations</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage connection status and available capabilities.
          </p>
          <Link
            href="/dashboard/integrations"
            className="mt-3 inline-flex text-sm font-medium text-acet-600 hover:text-acet-700"
          >
            Open Integrations →
          </Link>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Security</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-600 leading-relaxed">
            <li>Service-role and payment secrets never reach the browser</li>
            <li>Organization isolation is enforced via RLS</li>
            <li>High-risk tools require explicit approval</li>
            <li>The model never receives API keys or OAuth tokens</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
