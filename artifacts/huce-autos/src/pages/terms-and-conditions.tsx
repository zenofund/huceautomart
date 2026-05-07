import { useState } from "react";
import { Layout } from "@/components/layout";

type TermsAudience = "buyer" | "seller";

const BUYER_TERMS = [
  {
    title: "Account Responsibility",
    body:
      "Buyers must maintain accurate account information and protect login credentials used for platform access and transactions.",
  },
  {
    title: "Offer and Payment Conduct",
    body:
      "All offers and payments should be made through approved in-app channels to ensure escrow protection and proper transaction records.",
  },
  {
    title: "Inspection and Confirmation",
    body:
      "Buyers are responsible for reviewing listing details, requesting inspections when needed, and confirming purchases only after satisfaction.",
  },
  {
    title: "Dispute Handling",
    body:
      "Where issues arise, buyers should use the official dispute flow and provide complete evidence for timely and fair resolution.",
  },
];

const SELLER_TERMS = [
  {
    title: "Listing Accuracy",
    body:
      "Sellers must provide truthful and complete listing information, including condition, documents, and material vehicle details.",
  },
  {
    title: "Verification Compliance",
    body:
      "Sellers must complete required verification steps and maintain valid profile and payout information to access full seller features.",
  },
  {
    title: "Transaction Integrity",
    body:
      "Sellers should complete all transactions through approved platform flows and avoid off-platform arrangements for protected purchases.",
  },
  {
    title: "Post-Sale Obligations",
    body:
      "After buyer confirmation and successful completion, sellers must cooperate with any required transfer, documentation, or support follow-up.",
  },
];

export default function TermsAndConditionsPage() {
  const [audience, setAudience] = useState<TermsAudience>("buyer");
  const terms = audience === "buyer" ? BUYER_TERMS : SELLER_TERMS;

  return (
    <Layout>
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-1">Terms &amp; Conditions</h1>
          <p className="text-primary-foreground/70 text-sm max-w-3xl">
            Review the key platform terms for buyers and sellers on Huce Autos.
          </p>
        </div>
      </div>

      <section className="container mx-auto px-4 py-8 md:py-10">
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setAudience("buyer")}
            className={`h-10 min-w-[92px] rounded-lg px-6 text-sm font-medium transition-colors ${
              audience === "buyer" ? "bg-[#F3F4F6] text-gray-900" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Buyer
          </button>
          <button
            type="button"
            onClick={() => setAudience("seller")}
            className={`h-10 min-w-[92px] rounded-lg px-6 text-sm font-medium transition-colors ${
              audience === "seller" ? "bg-[#B9992C] text-white" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Seller
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {terms.map((item) => (
            <article key={`${audience}-${item.title}`} className="rounded-xl border border-[#E9EEF9] bg-[#F8FCF9] p-5">
              <h2 className="text-base font-bold text-foreground">{item.title}</h2>
              <p className="mt-2 text-sm md:text-base text-muted-foreground leading-relaxed">{item.body}</p>
            </article>
          ))}
        </div>
      </section>
    </Layout>
  );
}
