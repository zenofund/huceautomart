import { BadgeCheck, Headphones, ShieldCheck, CarFront, Users } from "lucide-react";
import { Layout } from "@/components/layout";

const OFFERS = [
  {
    number: "01",
    title: "Verified Listings",
    description:
      "All cars on our platform are listed by verified sellers, improving trust and reliability for every buyer.",
  },
  {
    number: "02",
    title: "Secure Transactions",
    description:
      "Our escrow-enabled workflow protects funds and helps both parties complete transactions with confidence.",
  },
  {
    number: "03",
    title: "Nationwide Access",
    description:
      "Whether in Lagos, Abuja, or any city in Nigeria, Huce Autos connects buyers and sellers nationwide.",
  },
];

const WHY_CHOOSE_US = [
  {
    title: "Trusted by Thousands",
    description: "A growing marketplace used by buyers and sellers across Nigeria.",
    icon: Users,
  },
  {
    title: "Dedicated Support",
    description: "Responsive support to help with listing, offers, purchases, and account questions.",
    icon: Headphones,
  },
  {
    title: "Wide Car Selection",
    description: "Explore cars for different budgets, preferences, and use cases in one place.",
    icon: CarFront,
  },
];

export default function AboutUsPage() {
  return (
    <Layout>
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-1">About Us</h1>
          <p className="text-primary-foreground/70 text-sm max-w-3xl">
            We are building a safer and more reliable way to buy and sell cars in Nigeria.
          </p>
        </div>
      </div>

      <section className="container mx-auto px-4 py-8 md:py-10 space-y-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          <div>
            <h2 className="text-2xl font-bold text-foreground leading-tight">
              We Value Our Clients And Want Them To Have A Nice Experience
            </h2>
            <p className="mt-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              Welcome to Huce Autos, Nigeria&apos;s premier platform for buying and selling cars. We are committed to simplifying the car
              trading experience by connecting buyers and sellers in a secure, transparent, and seamless environment.
            </p>
            <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">
              We prioritize trust, convenience, and efficiency in every interaction, supported by verified users, secure payments, and
              modern marketplace tools.
            </p>
          </div>
          <div className="rounded-2xl overflow-hidden border border-[#E9EEF9] bg-white p-3">
            <img
              src={`${import.meta.env.BASE_URL}cars-hero.png`}
              alt="Huce Autos marketplace"
              className="w-full h-72 object-cover rounded-xl"
            />
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-foreground">What We Offer</h2>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {OFFERS.map((item) => (
              <article key={item.title} className="rounded-xl border border-[#E9EEF9] bg-[#F8FCF9] p-5">
                <div className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground">
                  {item.number}
                </div>
                <h3 className="mt-3 text-base font-bold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </article>
            ))}
          </div>
        </div>

        <article className="rounded-xl border border-[#E9EEF9] bg-white p-6">
          <h2 className="text-2xl font-bold text-foreground">Our Mission</h2>
          <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">
            To redefine how Nigerians buy and sell cars by delivering a platform that prioritizes security, convenience, and trust.
          </p>
        </article>

        <div>
          <h2 className="text-2xl font-bold text-foreground">Why Choose Us?</h2>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            {WHY_CHOOSE_US.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-xl border border-[#E9EEF9] bg-white p-5">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </article>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E9EEF9] bg-[#F8FCF9] p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-foreground">Join us today and experience the difference.</p>
            <p className="text-sm text-muted-foreground mt-1">Dream Cars, Dream Huce Autos.</p>
          </div>
          <button
            type="button"
            className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Get Started
          </button>
        </div>
      </section>
    </Layout>
  );
}
