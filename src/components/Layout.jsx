import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Home, CalendarDays, User, MessageCircle, Search, Crown, Users, Gift, ShoppingBag, Store, Bell, MoreHorizontal, Settings as SettingsIcon, Wrench, Cpu, FlaskConical, Shield, ScrollText, Gauge, LayoutDashboard } from "lucide-react";
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';

const mainNav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/marketplace", label: "Market", icon: ShoppingBag },
  { to: "/feed", label: "Socials", icon: Users },
  { to: "/events", label: "Events", icon: CalendarDays },
  { to: "/garage", label: "Garage", icon: Wrench },
  { to: "/shop", label: "Shop", icon: Store },
];

const moreNav = [
  { to: "/ai-command-center", label: "AI Command Center", icon: Cpu, adminOnly: true },
  { to: "/testing", label: "Testing Centre", icon: FlaskConical, adminOnly: true },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
  { to: "/admin", label: "Admin", icon: LayoutDashboard, modOnly: true },
  { to: "/moderation", label: "Moderation", icon: Shield, modOnly: true },
  { to: "/admin/audit", label: "Audit Log", icon: ScrollText, modOnly: true },
  { to: "/admin/entitlements", label: "Entitlements", icon: Crown, adminOnly: true },
  { to: "/admin/jobs", label: "Job Status", icon: Gauge, adminOnly: true },
];

export default function Layout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(0);
  const { user } = useAuth();
  const isMod = user?.role === 'admin' || user?.account_tier === 'moderator';
  const isAdmin = user?.role === 'admin';
  const visibleMoreNav = moreNav.filter((item) => (!item.modOnly || isMod) && (!item.adminOnly || isAdmin));
  const routeBlocked = moreNav.some((item) => (location.pathname === item.to || location.pathname.startsWith(item.to + "/")) && ((item.adminOnly && !isAdmin) || (item.modOnly && !isMod)));

  React.useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Fetch unread notification count on mount and on route change so the bell
  // badge stays current after actions that create notifications.
  React.useEffect(() => {
    if (!user) return;
    let active = true;
    base44.entities.Notification.filter({ recipient_id: user.id, read_at: null }, "-created_date", 100)
      .then((ns) => { if (active) setUnread(ns.length); })
      .catch(() => {});
    return () => { active = false; };
  }, [user, location.pathname]);

  const isMoreActive = visibleMoreNav.some((item) => location.pathname === item.to);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="glass sticky top-0 z-40 border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="https://media.base44.com/images/public/6a608f773139e5ae1fe2f62b/c05f698de_generated_image.png" alt="HondaHub" className="h-8 w-8 rounded-lg object-cover" />
            <span className="text-xl font-black tracking-tighter">
              Honda<span className="text-primary">Hub</span>
            </span>
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">AU</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {visibleMoreNav.map((item) => (
              <Link key={item.to} to={item.to} className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">{item.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <div className="relative md:hidden">
              <button onClick={() => setMenuOpen(!menuOpen)} className={`rounded-lg p-2 hover:bg-secondary hover:text-foreground ${isMoreActive ? "text-primary" : "text-muted-foreground"}`}>
                <MoreHorizontal className="h-5 w-5" />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-50" onClick={() => setMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-border bg-popover/95 shadow-2xl backdrop-blur-xl"
                    >
                      {visibleMoreNav.map((item) => {
                        const active = location.pathname === item.to;
                        const Icon = item.icon;
                        return (
                          <Link key={item.to} to={item.to} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition ${active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary"}`}>
                            <Icon className="h-4 w-4" strokeWidth={2} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <Link to="/notifications" className="relative rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <Link to="/marketplace" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground md:hidden">
              <Search className="h-5 w-5" />
            </Link>
            <Link to="/pricing" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Crown className="h-5 w-5" />
            </Link>
            <Link to="/conversations" className="relative rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <MessageCircle className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-4 pb-40 md:pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {routeBlocked ? (
              <div className="mx-auto max-w-md py-20 text-center">
                <Shield className="mx-auto mb-4 h-10 w-10 text-slate-400" />
                <h2 className="text-lg font-semibold text-slate-100">Access restricted</h2>
                <p className="mt-2 text-sm text-slate-400">You do not have permission to view this page.</p>
                <Link to="/" className="mt-4 inline-block text-sm text-rose-400 hover:underline">Go back home</Link>
              </div>
            ) : (
              <Outlet />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating glass pill nav — Instagram + Apple vibes */}
      <nav
        className="fixed left-1/2 z-40 -translate-x-1/2 md:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div className="flex items-center gap-0.5 rounded-[1.75rem] border border-white/10 bg-card/70 px-2 py-1.5 shadow-2xl backdrop-blur-2xl">
          {mainNav.map((item) => {
            const active = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex w-14 flex-col items-center justify-center gap-0.5 py-1"
              >
                <Icon
                  className={`h-[22px] w-[22px] transition-all duration-200 ${
                    active ? "text-primary scale-110" : "text-muted-foreground"
                  }`}
                  strokeWidth={active ? 2.5 : 1.8}
                  fill={active ? "currentColor" : "none"}
                />
                <span className={`text-[9px] font-semibold leading-none transition ${active ? "text-primary" : "text-muted-foreground"}`}>
                  {item.label}
                </span>
                {active && <span className="mt-0.5 h-1 w-1 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </div>
      </nav>

    </div>
  );
}