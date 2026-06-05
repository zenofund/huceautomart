import { ReactNode, useState } from "react";
import { Link } from "wouter";
import { Phone, Mail, MapPin, Facebook, Instagram, ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function MobileFooterSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl overflow-y-auto px-4 sm:px-6">
        <SheetHeader className="text-left mb-6 mt-2">
          <SheetTitle className="text-xl font-bold">More Information</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-8 pb-10">
          {/* Quick Links & Company */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Quick Links</h4>
              <ul className="space-y-3 text-sm font-medium text-gray-600">
                <li><Link href="/cars" onClick={() => setOpen(false)}>Buy a Car</Link></li>
                <li><Link href="/sell" onClick={() => setOpen(false)}>Sell a Car</Link></li>
                <li><Link href="/news" onClick={() => setOpen(false)}>News</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Company</h4>
              <ul className="space-y-3 text-sm font-medium text-gray-600">
                <li><Link href="/about" onClick={() => setOpen(false)}>About Us</Link></li>
                <li><Link href="/contact" onClick={() => setOpen(false)}>Contact Us</Link></li>
                <li><Link href="/how-it-works" onClick={() => setOpen(false)}>How it Works</Link></li>
                <li><Link href="/faq" onClick={() => setOpen(false)}>FAQ's</Link></li>
              </ul>
            </div>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Legal & Policies</h4>
            <ul className="space-y-3 text-sm font-medium text-gray-600">
              <li><Link href="/terms-and-conditions" onClick={() => setOpen(false)}>Terms &amp; Conditions</Link></li>
              <li><Link href="/privacy-policy" onClick={() => setOpen(false)}>Privacy Policy</Link></li>
              <li><Link href="/refund-policy" onClick={() => setOpen(false)}>Refund Policy</Link></li>
              <li><Link href="/verified-sellers-program" onClick={() => setOpen(false)}>Verified Sellers Program</Link></li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Contact Us</h4>
            <div className="flex flex-col gap-3 text-sm text-gray-600 font-medium">
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-primary" />
                <span>0913 598 8513</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-primary" />
                <span>hello@huceautos.com</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-primary" />
                <span>Lagos, Abuja, Port Harcourt</span>
              </div>
            </div>
          </div>

          {/* Apps & Socials */}
          <div className="flex flex-col gap-6">
            <div>
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Get the app</h4>
              <div className="flex gap-3">
                <a href="#" className="flex-1 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  App Store
                </a>
                <a href="#" className="flex-1 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3.18 23.76c.3.17.64.24.99.2l12.6-7.28-2.7-2.7-10.89 9.78zM.54 1.04C.2 1.4 0 1.96 0 2.68v18.64c0 .72.2 1.28.55 1.64l.09.08 10.44-10.44v-.24L.63.96l-.09.08zM20.4 10.28l-2.98-1.72-3.02 3.02 3.02 3.02 3-1.73c.85-.49.85-1.29-.02-1.59zM3.18.24l12.6 7.28-2.7 2.7L3.18.24z"/>
                  </svg>
                  Google Play
                </a>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Connect With Us</h4>
              <div className="flex items-center gap-3">
                <a href="https://www.facebook.com/profile.php?id=61588837874397" target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-primary hover:text-white transition-colors">
                  <Facebook className="h-4 w-4" />
                </a>
                <a href="https://www.instagram.com/huceautomart?igsh=aTlicG1peHp1Z2lq" target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-primary hover:text-white transition-colors">
                  <Instagram className="h-4 w-4" />
                </a>
                <a href="https://www.tiktok.com/@huceautomart" target="_blank" rel="noopener noreferrer" className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-primary hover:text-white transition-colors">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.12-3.44-3.17-3.61-5.46-.02-.33-.02-.66-.02-.99.1-1.36.56-2.71 1.34-3.83 1.18-1.78 3.1-2.95 5.23-3.15.35-.04.7-.04 1.05-.04v4.01c-.89.04-1.77.34-2.51.87-.87.62-1.46 1.53-1.61 2.6-.08.57-.04 1.16.14 1.7.35.98 1.12 1.8 2.05 2.19.86.37 1.85.42 2.74.13.93-.31 1.72-.98 2.17-1.85.31-.6.44-1.27.46-1.93.01-4.66.01-9.32.01-13.98z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
