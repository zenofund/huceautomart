import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/auth-context";
import Home from "@/pages/home";
import CarsPage from "@/pages/cars";
import CarDetailPage from "@/pages/car-detail";
import SellPage from "@/pages/sell";
import SellersPage from "@/pages/sellers";
import SellerProfilePage from "@/pages/seller-profile";
import ComparePage from "@/pages/compare";
import NewsPage from "@/pages/news";
import NewsDetailPage from "@/pages/news-detail";
import HowItWorksPage from "@/pages/how-it-works";
import FaqPage from "@/pages/faq";
import AboutUsPage from "@/pages/about-us";
import ContactUsPage from "@/pages/contact-us";
import VerifiedSellersProgramPage from "@/pages/verified-sellers-program";
import RefundPolicyPage from "@/pages/refund-policy";
import PrivacyPolicyPage from "@/pages/privacy-policy";
import TermsAndConditionsPage from "@/pages/terms-and-conditions";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminUsersPage from "@/pages/admin-users";
import AdminUserDetailPage from "@/pages/admin-user-detail";
import AdminInventoryPage from "@/pages/admin-inventory";
import AdminListingDetailPage from "@/pages/admin-listing-detail";
import AdminDeleteListingRequestsPage from "@/pages/admin-delete-listing-requests";
import AdminOffersPage from "@/pages/admin-offers";
import { AdminSubscriptionsPage } from "@/pages/admin-subscriptions";
import { AdminCmsPage } from "@/pages/admin-cms";
import AdminSettingsPage from "@/pages/admin-settings";
import AdminSettingsUserDetailPage from "@/pages/admin-settings-user-detail";
import AdminSellerApprovalDetailPage from "@/pages/admin-seller-approval-detail";
import AdminSupportPage from "@/pages/admin-support";
import AdminFinancesPage from "@/pages/admin-finances";
import { RequireAdmin } from "@/components/require-admin";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import VerifyOtpPage from "@/pages/verify-otp";
import ForgotPasswordPage from "@/pages/forgot-password";
import GoogleOnboardingPage from "@/pages/google-onboarding";
import BuyerDashboard from "@/pages/buyer-dashboard";
import BuyerActivity from "@/pages/buyer-activity";
import BuyerInspectionDetail from "@/pages/buyer-inspection-detail";
import BuyerOfferDetail from "@/pages/buyer-offer-detail";
import BuyerSavedCars from "@/pages/buyer-saved-cars";
import BuyerViewedHistory from "@/pages/buyer-viewed-history";
import BuyerProfile from "@/pages/buyer-profile";
import BuyerSupport from "@/pages/buyer-support";
import BuyerWallet from "@/pages/buyer-wallet";
import BuyerBankAccounts from "@/pages/buyer-bank-accounts";
import PaymentCallback from "@/pages/payment-callback";
import BuyerMessages from "@/pages/buyer-messages";
import NotificationsPage from "@/pages/notifications";
import SellerDashboard from "@/pages/seller-dashboard";
import SellerSettings from "@/pages/seller-settings";
import SellerListings from "@/pages/seller-listings";
import SellerListingDetail from "@/pages/seller-listing-detail";
import SellerOffers from "@/pages/seller-offers";
import InspectorDashboard from "@/pages/inspector-dashboard";
import InspectorInspections from "@/pages/inspector-inspections";
import InspectorInspectionDetail from "@/pages/inspector-inspection-detail";
import InspectorWallet from "@/pages/inspector-wallet";
import InspectorProfile from "@/pages/inspector-profile";
import ReviewAppPage from "@/pages/review-app";
import NotFound from "@/pages/not-found";
import { RequireAuth } from "@/components/require-auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/cars" component={CarsPage} />
      <Route path="/cars/:id" component={CarDetailPage} />
      <Route path="/sell" component={SellPage} />
      <Route path="/sellers" component={SellersPage} />
      <Route path="/sellers/:id" component={SellerProfilePage} />
      <Route path="/compare" component={ComparePage} />
      <Route path="/about" component={AboutUsPage} />
      <Route path="/contact" component={ContactUsPage} />
      <Route path="/how-it-works" component={HowItWorksPage} />
      <Route path="/faq" component={FaqPage} />
      <Route path="/verified-sellers-program" component={VerifiedSellersProgramPage} />
      <Route path="/refund-policy" component={RefundPolicyPage} />
      <Route path="/privacy-policy" component={PrivacyPolicyPage} />
      <Route path="/terms-and-conditions" component={TermsAndConditionsPage} />
      <Route path="/news" component={NewsPage} />
      <Route path="/news/:slug" component={NewsDetailPage} />
      <Route path="/admin"><RequireAdmin><AdminDashboard /></RequireAdmin></Route>
      <Route path="/admin/users"><RequireAdmin><AdminUsersPage /></RequireAdmin></Route>
      <Route path="/admin/users/:id"><RequireAdmin><AdminUserDetailPage /></RequireAdmin></Route>
      <Route path="/admin/inventory/delete-requests"><RequireAdmin><AdminDeleteListingRequestsPage /></RequireAdmin></Route>
      <Route path="/admin/inventory/:id"><RequireAdmin><AdminListingDetailPage /></RequireAdmin></Route>
      <Route path="/admin/inventory"><RequireAdmin><AdminInventoryPage /></RequireAdmin></Route>
      <Route path="/admin/offers"><RequireAdmin><AdminOffersPage /></RequireAdmin></Route>
      <Route path="/admin/subscriptions"><RequireAdmin><AdminSubscriptionsPage /></RequireAdmin></Route>
      <Route path="/admin/finances"><RequireAdmin><AdminFinancesPage /></RequireAdmin></Route>
      <Route path="/admin/support"><RequireAdmin><AdminSupportPage /></RequireAdmin></Route>
      <Route path="/admin/cms"><RequireAdmin><AdminCmsPage /></RequireAdmin></Route>
      <Route path="/admin/settings/seller-approval/:id"><RequireAdmin><AdminSellerApprovalDetailPage /></RequireAdmin></Route>
      <Route path="/admin/settings/users/:id"><RequireAdmin><AdminSettingsUserDetailPage /></RequireAdmin></Route>
      <Route path="/admin/settings"><RequireAdmin><AdminSettingsPage /></RequireAdmin></Route>
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/verify-otp" component={VerifyOtpPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/google-onboarding" component={GoogleOnboardingPage} />
      <Route path="/dashboard"><RequireAuth><BuyerDashboard /></RequireAuth></Route>
      <Route path="/dashboard/activity"><RequireAuth><BuyerActivity /></RequireAuth></Route>
      <Route path="/dashboard/activity/inspection/:id"><RequireAuth><BuyerInspectionDetail /></RequireAuth></Route>
      <Route path="/dashboard/activity/offer/:id"><RequireAuth><BuyerOfferDetail /></RequireAuth></Route>
      <Route path="/dashboard/saved"><RequireAuth><BuyerSavedCars /></RequireAuth></Route>
      <Route path="/dashboard/history"><RequireAuth><BuyerViewedHistory /></RequireAuth></Route>
      <Route path="/dashboard/profile"><RequireAuth><BuyerProfile /></RequireAuth></Route>
      <Route path="/dashboard/support"><RequireAuth><BuyerSupport /></RequireAuth></Route>
      <Route path="/dashboard/wallet"><RequireAuth><BuyerWallet /></RequireAuth></Route>
      <Route path="/dashboard/bank-accounts"><RequireAuth><BuyerBankAccounts /></RequireAuth></Route>
      <Route path="/payments/callback" component={PaymentCallback} />
      <Route path="/dashboard/messages"><RequireAuth><BuyerMessages /></RequireAuth></Route>
      <Route path="/dashboard/messages/:id"><RequireAuth><BuyerMessages /></RequireAuth></Route>
      <Route path="/notifications"><RequireAuth><NotificationsPage /></RequireAuth></Route>
      <Route path="/dashboard/review-app"><RequireAuth><ReviewAppPage /></RequireAuth></Route>
      <Route path="/dashboard/:rest*"><RequireAuth><BuyerDashboard /></RequireAuth></Route>
      <Route path="/seller"><RequireAuth><SellerDashboard /></RequireAuth></Route>
      <Route path="/seller/settings"><RequireAuth><SellerSettings /></RequireAuth></Route>
      <Route path="/seller/listings"><RequireAuth><SellerListings /></RequireAuth></Route>
      <Route path="/seller/listings/:id"><RequireAuth><SellerListingDetail /></RequireAuth></Route>
      <Route path="/seller/offers"><RequireAuth><SellerOffers /></RequireAuth></Route>
      <Route path="/seller/wallet"><RequireAuth><BuyerWallet /></RequireAuth></Route>
      <Route path="/seller/bank-accounts"><RequireAuth><BuyerBankAccounts /></RequireAuth></Route>
      <Route path="/seller/support"><RequireAuth><BuyerSupport /></RequireAuth></Route>
      <Route path="/seller/messages"><RequireAuth><BuyerMessages /></RequireAuth></Route>
      <Route path="/seller/messages/:id"><RequireAuth><BuyerMessages /></RequireAuth></Route>
      <Route path="/seller/review-app"><RequireAuth><ReviewAppPage /></RequireAuth></Route>
      <Route path="/seller/:rest*"><RequireAuth><SellerDashboard /></RequireAuth></Route>
      <Route path="/inspector"><RequireAuth><InspectorDashboard /></RequireAuth></Route>
      <Route path="/inspector/inspections"><RequireAuth><InspectorInspections /></RequireAuth></Route>
      <Route path="/inspector/inspections/:id"><RequireAuth><InspectorInspectionDetail /></RequireAuth></Route>
      <Route path="/inspector/wallet"><RequireAuth><InspectorWallet /></RequireAuth></Route>
      <Route path="/inspector/bank-accounts"><RequireAuth><BuyerBankAccounts /></RequireAuth></Route>
      <Route path="/inspector/profile"><RequireAuth><InspectorProfile /></RequireAuth></Route>
      <Route path="/inspector/review-app"><RequireAuth><ReviewAppPage /></RequireAuth></Route>
      <Route path="/inspector/:rest*"><RequireAuth><InspectorDashboard /></RequireAuth></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
