import { Layout } from "@/components/layout";

const PRIVACY_SECTIONS = [
  {
    title: "Information We Collect",
    body:
      "We collect account, profile, listing, transaction, and support-related information necessary to operate marketplace services securely.",
  },
  {
    title: "How We Use Information",
    body:
      "Your information is used to provide core platform functionality, verify users, prevent fraud, support transactions, and improve service quality.",
  },
  {
    title: "Sharing and Disclosure",
    body:
      "Data is shared only where necessary for service delivery, legal compliance, payment processing, or dispute handling under applicable policy.",
  },
  {
    title: "Security and Retention",
    body:
      "We apply technical and operational safeguards and retain records for legitimate business, legal, and fraud-prevention purposes.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <Layout>
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-1">Privacy Policy</h1>
          <p className="text-primary-foreground/70 text-sm max-w-3xl">
            Learn how Huce Autos collects, uses, protects, and manages personal information on the platform.
          </p>
        </div>
      </div>

      <section className="container mx-auto px-4 py-8 md:py-10 space-y-6">
        <article className="rounded-xl border border-[#E9EEF9] bg-white p-6">
          <h2 className="text-xl font-bold text-foreground">Your Privacy on Huce Autos</h2>
          <p className="mt-3 text-sm md:text-base leading-relaxed text-muted-foreground">
            We are committed to handling personal data responsibly. This policy outlines core principles for transparency,
            security, and lawful data use across account, listing, and transaction features.
          </p>
        </article>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PRIVACY_SECTIONS.map((section) => (
            <article key={section.title} className="rounded-xl border border-[#E9EEF9] bg-[#F8FCF9] p-5">
              <h3 className="text-base font-bold text-foreground">{section.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{section.body}</p>
            </article>
          ))}
        </div>
      </section>
    </Layout>
  );
}
