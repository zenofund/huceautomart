import { useState, type ComponentType } from "react";
import {
  Search,
  ShieldCheck,
  CarFront,
  BadgeCheck,
  UserPlus,
  Handshake,
  Wallet,
} from "lucide-react";
import { Layout } from "@/components/layout";

type Audience = "buyer" | "seller";

interface StepItem {
  number: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

const BUYER_STEPS: StepItem[] = [
  {
    number: "01",
    title: "Search for Your Car",
    description:
      "Browse our platform using filters like make, model, price, location, and more to find the perfect car.",
    icon: Search,
  },
  {
    number: "02",
    title: "Connect with Verified Sellers",
    description:
      "View detailed listings from sellers who have been verified for trustworthiness.",
    icon: BadgeCheck,
  },
  {
    number: "03",
    title: "Secure Your Payment",
    description:
      "When ready to purchase, make your payment via our secure escrow system. This ensures your money is safe until you confirm receipt of the vehicle.",
    icon: ShieldCheck,
  },
  {
    number: "04",
    title: "Inspect and Confirm",
    description:
      "Schedule an inspection or meet the seller to verify the car's condition matches its description.",
    icon: CarFront,
  },
  {
    number: "05",
    title: "Complete the Transaction",
    description:
      "Confirm purchase to release funds to the seller and complete ownership transfer seamlessly.",
    icon: Handshake,
  },
];

const SELLER_STEPS: StepItem[] = [
  {
    number: "01",
    title: "Create an Account",
    description:
      "Sign up and complete the seller verification process to ensure trust and credibility.",
    icon: UserPlus,
  },
  {
    number: "02",
    title: "List Your Car",
    description:
      "Upload high-quality photos, detailed descriptions, and a fair price to attract buyers.",
    icon: CarFront,
  },
  {
    number: "03",
    title: "Connect with Interested Buyers",
    description:
      "Respond to inquiries and arrange viewings or inspections with potential buyers.",
    icon: Handshake,
  },
  {
    number: "04",
    title: "Secure Transactions",
    description:
      "Receive payments through our escrow system, ensuring funds are secure until the buyer confirms the transaction.",
    icon: ShieldCheck,
  },
  {
    number: "05",
    title: "Get Paid",
    description:
      "After buyer confirmation, your funds are released to your wallet and available for withdrawal.",
    icon: Wallet,
  },
];

function StepBadge({
  number,
  Icon,
}: {
  number: string;
  Icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="relative h-10 w-10 shrink-0">
      <div className="absolute inset-0 flex items-center justify-center">
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={i}
            className="absolute h-0.5 w-6 rounded bg-[#046C4E]"
            style={{ transform: `rotate(${i * 45}deg)` }}
          />
        ))}
      </div>
      <div className="absolute inset-0 m-auto flex h-10 w-10 items-center justify-center rounded-lg bg-[#046C4E] shadow-sm">
        <span className="text-[20px] font-black tracking-tight text-white/10 absolute">
          {number}
        </span>
        <Icon className="h-3 w-3 text-white absolute -top-1 -right-1 bg-[#046C4E] rounded-full p-0.5" />
        <span className="relative text-[20px] leading-none font-black text-white">{number}</span>
      </div>
    </div>
  );
}

function StepCard({ step }: { step: StepItem }) {
  return (
    <article className="rounded-xl border border-[#E9EEF9] bg-white px-6 py-6">
      <div className="flex items-center gap-5">
        <StepBadge number={step.number} Icon={step.icon} />
        <div>
          <h3 className="text-base leading-tight font-bold text-gray-900">
            {step.title}
          </h3>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {step.description}
      </p>
    </article>
  );
}

export default function HowItWorksPage() {
  const [audience, setAudience] = useState<Audience>("buyer");
  const steps = audience === "buyer" ? BUYER_STEPS : SELLER_STEPS;

  return (
    <Layout>
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-1">How It Works</h1>
          <p className="text-primary-foreground/70 text-sm max-w-3xl">
            Simple, secure steps for buyers and sellers on Huce Autos.
          </p>
        </div>
      </div>

      <section className="container mx-auto px-4 py-8 md:py-10">
        <p className="text-sm md:text-base leading-relaxed text-muted-foreground max-w-4xl">
          Discover how Huce Autos connects buyers and sellers with a safe and hassle-free process for all your car needs.
        </p>

        <div className="mt-6 inline-flex rounded-xl border border-gray-200 bg-white p-1">
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

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {steps.map((step, idx) => (
            <div key={`${audience}-${step.number}`} className={idx === steps.length - 1 && steps.length % 2 === 1 ? "lg:col-span-1" : ""}>
              <StepCard step={step} />
            </div>
          ))}
        </div>
      </section>
    </Layout>
  );
}
