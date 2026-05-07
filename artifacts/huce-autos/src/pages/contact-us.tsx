import { FormEvent, useState } from "react";
import { Mail, Phone, MapPin } from "lucide-react";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ContactUsPage() {
  const [message, setMessage] = useState("");

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
  };

  return (
    <Layout>
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-1">Contact Us</h1>
          <p className="text-primary-foreground/70 text-sm max-w-3xl">
            Have questions or want to get in touch with us? We are here to help.
          </p>
        </div>
      </div>

      <section className="container mx-auto px-4 py-8 md:py-10 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <article className="rounded-xl border border-[#E9EEF9] bg-white p-5 text-center">
            <div className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Mail className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm md:text-base font-semibold text-foreground">support@huceautos.com</p>
          </article>

          <article className="rounded-xl border border-[#E9EEF9] bg-white p-5 text-center">
            <div className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Phone className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm md:text-base font-semibold text-foreground">+234 805 071 5672</p>
          </article>

          <article className="rounded-xl border border-[#E9EEF9] bg-white p-5 text-center">
            <div className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <MapPin className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm md:text-base font-semibold text-foreground">
              Chief Kobani Street, Woji Road, Port Harcourt, Rivers State, Nigeria.
            </p>
          </article>
        </div>

        <div className="rounded-xl border border-[#E9EEF9] bg-white p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Full Name</label>
                  <Input placeholder="Enter your name" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Email</label>
                  <Input type="email" placeholder="Enter your email" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Phone Number</label>
                <Input placeholder="Enter your number" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Message</label>
                <Textarea
                  placeholder="Enter your message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value.slice(0, 250))}
                  className="min-h-32"
                />
                <p className="mt-1 text-xs text-muted-foreground text-right">Max 250 chars</p>
              </div>

              <button
                type="submit"
                className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Send Message
              </button>
            </form>

            <div className="rounded-xl overflow-hidden border border-[#E9EEF9] min-h-[340px]">
              <iframe
                title="Huce Autos Location"
                src="https://maps.google.com/maps?q=Abuja%20Nigeria&t=&z=13&ie=UTF8&iwloc=&output=embed"
                className="w-full h-full min-h-[340px]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
