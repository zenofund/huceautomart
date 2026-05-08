import { Layout } from "@/components/layout";

export default function PrivacyPolicyPage() {
  return (
    <Layout>
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-1">Privacy Policy</h1>
          <p className="text-primary-foreground/70 text-sm max-w-3xl">
            Learn how Huce Automart collects, uses, protects, and manages personal information on the platform.
          </p>
        </div>
      </div>

      <section className="container mx-auto px-4 py-8 md:py-10 max-w-4xl space-y-8">
        {/* Intro */}
        <article>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
            <strong>Last Updated: {new Date().toLocaleDateString()}</strong><br /><br />
            Huce Automart ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our mobile application (the "App"). By using our services, you agree to the collection and use of information in accordance with this Privacy Policy.
          </p>
        </article>

        {/* 1. Information We Collect */}
        <article className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">1. Information We Collect</h2>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
            We collect information necessary to provide and improve our marketplace services. This includes:
          </p>
          <ul className="list-disc list-inside text-sm md:text-base leading-relaxed text-muted-foreground ml-4 space-y-2">
            <li><strong>Personal Information:</strong> Name, email address, phone number, and physical address provided during account registration or profile updates.</li>
            <li><strong>Authentication Data:</strong> Passwords, OTPs, and third-party OAuth tokens (e.g., Google Sign-In).</li>
            <li><strong>Media and Files:</strong> Photos, documents, or vehicle inspection reports you upload for car listings, profile avatars, or verification.</li>
            <li><strong>Financial Information:</strong> Payment transaction details processed securely via third-party providers (e.g., Paystack) for escrow, wallet funding, and withdrawals.</li>
            <li><strong>Device and Usage Information:</strong> IP addresses, device identifiers, Expo Push Notification tokens, and interactions with the App to ensure security and proper functionality.</li>
          </ul>
        </article>

        {/* 2. How We Use Your Information */}
        <article className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">2. How We Use Your Information</h2>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
            We use the collected information for the following purposes:
          </p>
          <ul className="list-disc list-inside text-sm md:text-base leading-relaxed text-muted-foreground ml-4 space-y-2">
            <li>To create, manage, and authenticate your account.</li>
            <li>To facilitate vehicle listings, transactions, and communications between buyers, sellers, and inspectors.</li>
            <li>To process payments, wallet withdrawals, and manage escrow services safely.</li>
            <li>To send administrative notifications, push notifications, and email updates regarding your transactions.</li>
            <li>To monitor for fraudulent activity and ensure compliance with our terms of service.</li>
          </ul>
        </article>

        {/* 3. Sharing and Disclosure */}
        <article className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">3. Sharing and Disclosure</h2>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
            We do not sell your personal data. We may share your information only in the following scenarios:
          </p>
          <ul className="list-disc list-inside text-sm md:text-base leading-relaxed text-muted-foreground ml-4 space-y-2">
            <li><strong>With Other Users:</strong> Necessary details (like your public profile or listing contact info) are shared to facilitate marketplace interactions.</li>
            <li><strong>Service Providers:</strong> We use third parties for payment processing, email delivery, push notifications, and hosting (e.g., Paystack, Expo, Render).</li>
            <li><strong>Legal Requirements:</strong> If required by law, court order, or governmental request to protect our rights and user safety.</li>
          </ul>
        </article>

        {/* 4. Data Retention and Deletion (Crucial for Play Store) */}
        <article className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">4. Data Retention and Deletion Rights</h2>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
            We retain personal information as long as your account is active or as needed to provide services, resolve disputes, and comply with legal obligations.
          </p>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground mt-2">
            <strong>Your Right to Delete Data:</strong> You have the right to request the deletion of your account and associated personal data. To initiate an account deletion:
          </p>
          <ul className="list-disc list-inside text-sm md:text-base leading-relaxed text-muted-foreground ml-4 space-y-2">
            <li>Navigate to your Account Settings in the App or Website and select "Delete Account" (if available).</li>
            <li>Alternatively, you can email our support team at <strong>support@huceautomart.com</strong> with the subject line "Account Deletion Request." We will process your request within 30 days, subject to legal and transaction retention requirements.</li>
          </ul>
        </article>

        {/* 5. Security */}
        <article className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">5. Security of Your Information</h2>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
            We implement industry-standard security measures, including SSL encryption, secure password hashing, and token-based authentication, to protect your data from unauthorized access or disclosure. However, no electronic transmission or storage is 100% secure.
          </p>
        </article>

        {/* 6. Children's Privacy */}
        <article className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">6. Children's Privacy</h2>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
            Our services are not intended for individuals under the age of 18. We do not knowingly collect personal data from children. If we discover that a child under 18 has provided us with personal information, we will delete it immediately.
          </p>
        </article>

        {/* 7. Contact Us */}
        <article className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">7. Contact Us</h2>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
            If you have questions or concerns about this Privacy Policy, or if you wish to exercise your data rights, please contact us at:
          </p>
          <div className="mt-2 text-sm md:text-base leading-relaxed text-muted-foreground bg-gray-50 p-4 rounded-lg border border-gray-100">
            <strong>Huce Automart Support</strong><br />
            Email: support@huceautomart.com<br />
            Website: https://huceautomart.com
          </div>
        </article>
      </section>
    </Layout>
  );
}
