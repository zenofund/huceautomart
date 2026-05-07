import { BadgeCheck, FileCheck2, ShieldCheck, Wallet } from "lucide-react";
import { Layout } from "@/components/layout";

const PROGRAM_BENEFITS = [
  {
    title: "Trusted Seller Badge",
    description:
      "Verified sellers receive a visible trust badge on listings and profile pages to improve buyer confidence.",
    icon: BadgeCheck,
  },
  {
    title: "Faster Listing Trust",
    description:
      "Verification helps buyers make quicker decisions because your identity, documents, and account details are reviewed.",
    icon: FileCheck2,
  },
  {
    title: "Safer Transactions",
    description:
      "Verified status works with escrow protections to reduce transaction risks for both buyers and sellers.",
    icon: ShieldCheck,
  },
  {
    title: "Withdrawal Readiness",
    description:
      "A completed verification profile supports smoother wallet and payout processing after completed sales.",
    icon: Wallet,
  },
];

const VERIFICATION_REQUIREMENTS = [
  "Valid government-issued identification",
  "Accurate profile details matching your identification",
  "Verified bank account details for payouts",
  "Required seller documents submitted in clear format",
];

export default function VerifiedSellersProgramPage() {
  return (
    <Layout>
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-1">Verified Sellers Program</h1>
          <p className="text-primary-foreground/70 text-sm max-w-3xl">
            Learn how seller verification works and how it helps buyers transact with confidence on Huce Autos.
          </p>
        </div>
      </div>

      <section className="container mx-auto px-4 py-8 md:py-10 space-y-8">
        <article className="rounded-xl border border-[#E9EEF9] bg-white p-6">
          <h2 className="text-xl font-bold text-foreground">Program Overview</h2>
          <p className="mt-3 text-sm md:text-base leading-relaxed text-muted-foreground">
            The Verified Sellers Program is designed to improve trust across the marketplace. Sellers complete profile and document checks,
            then receive verified status when approved by the admin team.
          </p>
        </article>

        <article className="rounded-xl border border-[#E9EEF9] bg-white p-6">
          <h2 className="text-xl font-bold text-foreground">Why It Matters</h2>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {PROGRAM_BENEFITS.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <div key={benefit.title} className="rounded-lg border border-[#E9EEF9] bg-[#F8FCF9] p-4">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3 text-base font-bold text-foreground">{benefit.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{benefit.description}</p>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-xl border border-[#E9EEF9] bg-white p-6">
          <h2 className="text-xl font-bold text-foreground">Verification Requirements</h2>
          <ul className="mt-4 space-y-3 text-sm md:text-base text-muted-foreground">
            {VERIFICATION_REQUIREMENTS.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </Layout>
  );
}
