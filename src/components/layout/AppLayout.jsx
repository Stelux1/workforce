import { Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import TopBar from "./TopBar";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/LanguageContext";


export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { lang } = useLang();
  const location = useLocation();


  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar key={lang} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      </div>

      {/* Mobile Nav */}
      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main Content */}
      <div className={cn("min-h-screen transition-all duration-300", sidebarCollapsed ? "lg:ml-[68px]" : "lg:ml-[250px]")}>
        <TopBar onOpenMenu={() => setMobileOpen(true)} />

        {/* Page Content */}
        <main className="p-4 md:p-6 lg:p-8 max-w-[1600px]">
          {/* Nova adresa = nova granica: greška ostaje samo na stranici na kojoj se desila. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}