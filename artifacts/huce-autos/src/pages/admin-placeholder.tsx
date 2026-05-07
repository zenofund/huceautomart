import { Construction } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";

export function AdminPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto text-center bg-white border border-gray-200 rounded-xl p-12">
          <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
            <Construction className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2" data-testid="text-placeholder-title">
            {title}
          </h1>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
    </AdminLayout>
  );
}

export const AdminSubscriptionsPage = () => (
  <AdminPlaceholder
    title="Subscriptions"
    description="Manage seller subscription plans and active subscribers. Coming soon."
  />
);
export const AdminSettingsPage = () => (
  <AdminPlaceholder
    title="Settings"
    description="Configure platform settings and admin preferences. Coming soon."
  />
);
