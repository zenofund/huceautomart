import { Link } from "wouter";
import {
  BadgeCheck,
  MapPinned,
  PiggyBank,
  Images,
  Check,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type VerificationStepStatus = "pending" | "in_progress" | "completed";

export interface VerificationStep {
  id: string;
  title: string;
  mobileTitle?: string;
  action: string;
  status: VerificationStepStatus;
  icon: LucideIcon;
  href: string;
}

export function buildVerificationSteps(v: {
  nin: string;
  proof: string;
  bank: string;
  profile: string;
}): VerificationStep[] {
  const map = (s: string): VerificationStepStatus =>
    s === "completed" ? "completed" : s === "in_progress" ? "in_progress" : "pending";
  return [
    {
      id: "nin",
      title: "Verify NIN",
      mobileTitle: "NIN",
      action: "Upload NIN",
      status: map(v.nin),
      icon: BadgeCheck,
      href: "/seller/settings?tab=business#nin",
    },
    {
      id: "proof",
      title: "Proof of Address",
      mobileTitle: "Address",
      action: "Upload Proof of Address",
      status: map(v.proof),
      icon: MapPinned,
      href: "/seller/settings?tab=business#address",
    },
    {
      id: "bank",
      title: "Bank Details",
      mobileTitle: "Bank",
      action: "Update Bank Details",
      status: map(v.bank),
      icon: PiggyBank,
      href: "/seller/settings?tab=payment",
    },
    {
      id: "profile",
      title: "Profile Picture / Business Logo",
      mobileTitle: "Profile",
      action: "Upload Pictures",
      status: map(v.profile),
      icon: Images,
      href: "/seller/settings?tab=profile",
    },
  ];
}

function StatusPill({ status, action }: { status: VerificationStepStatus; action: string }) {
  if (status === "completed") {
    return (
      <span className="inline-flex max-w-full items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-medium text-primary sm:px-3 sm:py-1 sm:text-[11px]">
        Completed
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex max-w-full items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[8px] font-medium text-amber-700 sm:px-3 sm:py-1 sm:text-[11px]">
        In-Progress
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-medium text-primary/80 sm:px-3 sm:py-1 sm:text-[11px]">
      <span className="sm:hidden">Pending</span>
      <span className="hidden sm:inline">{action}</span>
    </span>
  );
}

export function SellerVerificationProgress({ steps }: { steps: VerificationStep[] }) {
  return (
    <div>
      <h2 className="text-base sm:text-xl font-extrabold tracking-tight text-gray-900">Your Progress</h2>
      <p className="mt-1 text-[11px] sm:text-sm text-gray-500">
        Check your progress and review the things.
      </p>

      <div className="mt-4 pb-2 sm:mt-6">
        <div className="grid grid-cols-4 gap-1.5 sm:gap-5">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const done = step.status === "completed";
          const nextDone = i < steps.length - 1 && steps[i + 1].status === "completed";

          return (
            <div key={step.id} className="relative flex flex-col">
              {/* connecting line — drawn from the right of this step's icon to the next */}
              {i < steps.length - 1 && (
                <div className="absolute left-[calc(50%+12px)] right-[calc(-50%+12px)] top-[13px] h-[2px] sm:left-[calc(50%+26px)] sm:right-[calc(-50%+26px)] sm:top-[22px] -z-0">
                  <div
                    className={cn(
                      "h-full w-full",
                      done && nextDone ? "bg-primary" : "bg-primary/15",
                    )}
                  />
                </div>
              )}

              <div className="flex flex-col items-start text-left sm:items-center sm:text-center min-w-0">
                <Link
                  href={step.href}
                  className={cn(
                    "relative z-10 flex h-[26px] w-[26px] sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/5 text-primary transition-colors",
                    done
                      ? "bg-primary text-primary-foreground border-primary"
                      : "ring-4 ring-white",
                  )}
                >
                  {done ? <Check className="h-3 w-3 sm:h-6 sm:w-6" /> : <Icon className="h-3 w-3 sm:h-6 sm:w-6" />}
                </Link>

                <div className="mt-1.5 text-[9px] sm:text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Step {i + 1}
                </div>
                <div className="mt-0.5 text-[10px] sm:text-lg font-semibold sm:font-extrabold leading-tight text-gray-900 break-words">
                  <span className="sm:hidden">{step.mobileTitle ?? step.title}</span>
                  <span className="hidden sm:inline">{step.title}</span>
                </div>
                <Link href={step.href} className="mt-1">
                  <StatusPill status={step.status} action={step.action} />
                </Link>
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
