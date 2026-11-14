import { Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { Menu, Bell } from "lucide-react";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import AppSettingsBar from "./AppSettingsBar";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
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
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border h-16 flex items-center justify-between px-4 md:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <AppSettingsBar />
            <Link to="/notifications">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </header>

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