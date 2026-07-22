import React from "react";
import { HelpCircle, Mail, Bug, FileText, Shield, Info, Trash2, AlertTriangle, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { SettingsRow } from "@/components/settings/SettingsSection";
import { getCurrentUser } from "@/lib/userIdentity";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export default function HelpAbout() {
  const { toast } = useToast();
  const [sending, setSending] = React.useState(false);

  const contactSupport = async () => {
    const name = getCurrentUser() || "User";
    setSending(true);
    try {
      await base44.integrations.Core.SendEmail({
        to: "support@hondahub.com.au",
        subject: `Support request from ${name}`,
        body: `User ${name} needs help with HondaHub.`,
      });
      toast({ title: "Support email sent", description: "We'll get back to you soon." });
    } catch {
      toast({ title: "Could not send email", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    localStorage.clear();
    await base44.auth.logout();
    window.location.href = "/";
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <SettingsRow icon={HelpCircle} label="Help Centre" right="chevron" onClick={() => toast({ title: "Coming soon" })} />
        <SettingsRow icon={Mail} label="Contact Support" sublabel={sending ? "Sending..." : "Email our team"} right="chevron" onClick={contactSupport} />
        <SettingsRow icon={Bug} label="Report a Bug" right="chevron" onClick={() => toast({ title: "Coming soon" })} />
        <SettingsRow icon={FileText} label="Terms of Service" right="chevron" onClick={() => toast({ title: "Coming soon" })} />
        <SettingsRow icon={Shield} label="Privacy Policy" right="chevron" onClick={() => toast({ title: "Coming soon" })} last />
      </div>

      <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground">
        <Info className="h-3 w-3" /> HondaHub v1.0.0
      </div>

      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-destructive" />
          <h2 className="text-lg font-bold text-destructive">Delete Account</h2>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>This will permanently delete your account and all your listings, garage builds, and messages. This cannot be undone.</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="mt-4 w-full rounded-xl bg-destructive py-3 text-sm font-bold text-destructive-foreground">Delete My Account</button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your account and all your listings, garage builds, and messages. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Yes, delete my account</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}