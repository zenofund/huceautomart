import { useState } from "react";
import {
  Search,
  BadgeCheck,
  ShieldCheck,
  AlertCircle,
  CalendarCheck2,
  Route,
  CreditCard,
  UserPlus,
  CarFront,
  MessagesSquare,
  Wallet,
  FileCheck2,
} from "lucide-react";
import { Layout } from "@/components/layout";

type Audience = "buyer" | "seller";

interface FaqItem {
  question: string;
  answer: string;
  icon: React.ComponentType<{ className?: string }>;
}

const BUYER_FAQS: FaqItem[] = [
  {
    question: "How do I search for a car on Huce Autos?",
    answer:
      "Use the search bar on the cars page to filter by make, model, price, location, and condition.",
    icon: Search,
  },
  {
    question: "Are the cars listed verified?",
    answer:
      "All cars listed on Huce Autos are from verified sellers who pass our trust and verification process.",
    icon: BadgeCheck,
  },
  {
    question: "How does the escrow system work?",
    answer:
      "Your payment is held securely in escrow and only released when you confirm the transaction is complete.",
    icon: ShieldCheck,
  },
  {
    question: "What happens if the car is not as described?",
    answer:
      "You can raise a dispute through the platform. Our team reviews evidence and resolves according to policy.",
    icon: AlertCircle,
  },
  {
    question: "Can I schedule an inspection before buying?",
    answer:
      "Yes. Buyers can book inspections and coordinate with sellers before confirming purchase.",
    icon: CalendarCheck2,
  },
  {
    question: "How do I track my purchase?",
    answer:
      "Go to your dashboard activity section to monitor purchase progress and transaction updates.",
    icon: Route,
  },
  {
    question: "What payment methods are accepted?",
    answer:
      "Payments are processed securely through supported transfer and card channels available at checkout.",
    icon: CreditCard,
  },
];

const SELLER_FAQS: FaqItem[] = [
  {
    question: "How do I create a seller account?",
    answer:
      "Sign up, complete profile details, and submit required verification documents in your settings.",
    icon: UserPlus,
  },
  {
    question: "How do I list my car effectively?",
    answer:
      "Add clear photos, accurate vehicle details, service history, and a competitive price to attract buyers.",
    icon: CarFront,
  },
  {
    question: "How do I communicate with buyers?",
    answer:
      "Use the in-app messaging flow to answer questions, negotiate offers, and coordinate inspections.",
    icon: MessagesSquare,
  },
  {
    question: "When do I receive payment?",
    answer:
      "Funds are released after buyer confirmation, then reflected in your wallet for withdrawal.",
    icon: Wallet,
  },
  {
    question: "Is seller verification mandatory?",
    answer:
      "Yes. Verification helps build trust and is required for full access to listing and transaction features.",
    icon: FileCheck2,
  },
];

function FaqCard({ item }: { item: FaqItem }) {
  const Icon = item.icon;
  return (
    <article className="rounded-xl border border-[#E9EEF9] bg-[#F8FCF9] px-5 py-5">
      <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="text-base font-bold text-foreground leading-tight">{item.question}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
    </article>
  );
}

export default function FaqPage() {
  const [audience, setAudience] = useState<Audience>("buyer");
  const faqs = audience === "buyer" ? BUYER_FAQS : SELLER_FAQS;

  return (
    <Layout>
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-1">FAQs</h1>
          <p className="text-primary-foreground/70 text-sm max-w-3xl">
            Answers to common questions for buyers and sellers on Huce Autos.
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
            Buyers
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

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {faqs.map((item) => (
            <FaqCard key={`${audience}-${item.question}`} item={item} />
          ))}
        </div>
      </section>
    </Layout>
  );
}
