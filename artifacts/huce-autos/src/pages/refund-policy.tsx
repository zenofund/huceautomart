import { Layout } from "@/components/layout";

const REFUND_CASES = [
  {
    title: "Eligible Cases",
    description:
      "Refund consideration applies when a transaction fails, is canceled according to platform flow, or is resolved in the buyer's favor after a dispute review.",
  },
  {
    title: "Non-Eligible Cases",
    description:
      "Refunds are not granted for completed and confirmed purchases where no policy breach or valid dispute evidence is established.",
  },
  {
    title: "Processing Timeline",
    description:
      "Approved refunds are processed through the original payment channel. Actual settlement time depends on the payment provider and bank processing windows.",
  },
  {
    title: "How to Request",
    description:
      "Open the relevant transaction in your dashboard, follow the available dispute or cancellation path, and provide complete supporting evidence.",
  },
];

export default function RefundPolicyPage() {
  return (
    <Layout>
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-1">Refund Policy</h1>
          <p className="text-primary-foreground/70 text-sm max-w-3xl">
            Understand when refunds apply, how requests are reviewed, and what to expect during processing.
          </p>
        </div>
      </div>

      <section className="container mx-auto px-4 py-8 md:py-10 space-y-6">
        <article className="rounded-xl border border-[#E9EEF9] bg-white p-6">
          <h2 className="text-xl font-bold text-foreground">Policy Scope</h2>
          <p className="mt-3 text-sm md:text-base leading-relaxed text-muted-foreground">
            This policy governs qualifying refund scenarios for transactions handled through Huce Autos payment and escrow workflows.
            Decisions are made based on available records, dispute evidence, and platform rules.
          </p>
        </article>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {REFUND_CASES.map((item) => (
            <article key={item.title} className="rounded-xl border border-[#E9EEF9] bg-[#F8FCF9] p-5">
              <h3 className="text-base font-bold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </Layout>
  );
}
