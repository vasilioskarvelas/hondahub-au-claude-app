import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import PersonalDetails from "@/components/settings/PersonalDetails";
import NotificationSettings from "@/components/settings/NotificationSettings";
import SubscriptionSection from "@/components/settings/SubscriptionSection";
import PrivacySettings from "@/components/settings/PrivacySettings";
import HelpAbout from "@/components/settings/HelpAbout";

export default function Settings() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      </div>

      <h1 className="text-2xl font-black tracking-tighter">Settings</h1>

      <PersonalDetails />

      <SettingsSection title="Notifications">
        <NotificationSettings />
      </SettingsSection>

      <SettingsSection title="Subscriptions & Payments">
        <SubscriptionSection />
      </SettingsSection>

      <SettingsSection title="Privacy">
        <PrivacySettings />
      </SettingsSection>

      <SettingsSection title="Help & About">
        <HelpAbout />
      </SettingsSection>
    </div>
  );
}