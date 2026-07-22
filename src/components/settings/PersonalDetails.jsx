import React from "react";
import { User, MapPin, Instagram, Camera, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getCurrentUser, setCurrentUser } from "@/lib/userIdentity";
import { useToast } from "@/components/ui/use-toast";

export default function PersonalDetails() {
  const { toast } = useToast();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(getCurrentUser());
  const [bio, setBio] = React.useState(localStorage.getItem("hh_bio") || "");
  const [location, setLocation] = React.useState(localStorage.getItem("hh_location") || "");
  const [instagram, setInstagram] = React.useState(localStorage.getItem("hh_instagram") || "");
  const [avatar, setAvatar] = React.useState(localStorage.getItem("hh_avatar") || "");
  const [uploading, setUploading] = React.useState(false);

  const handleAvatar = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setAvatar(file_url);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    if (name) setCurrentUser(name);
    localStorage.setItem("hh_bio", bio);
    localStorage.setItem("hh_location", location);
    localStorage.setItem("hh_instagram", instagram);
    localStorage.setItem("hh_avatar", avatar);
    setEditing(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-4">
        <label className="relative cursor-pointer">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-secondary">
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <User className="h-6 w-6 text-muted-foreground" />}
          </div>
          {editing && (
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary">
              {uploading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Camera className="h-3 w-3 text-white" />}
            </span>
          )}
          {editing && <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAvatar(e.target.files[0])} />}
        </label>
        <div className="flex-1">
          <div className="text-base font-black">{name || "Your Name"}</div>
          {location && <div className="text-xs text-muted-foreground">{location}</div>}
          {bio && <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{bio}</div>}
        </div>
        <button onClick={() => (editing ? save() : setEditing(true))} className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
          {editing ? <><Check className="h-3.5 w-3.5" /> Save</> : "Edit"}
        </button>
      </div>

      {editing && (
        <div className="mt-4 space-y-3">
          <Field icon={User} label="Display Name" value={name} onChange={setName} placeholder="Your name" />
          <Field icon={MapPin} label="Location" value={location} onChange={setLocation} placeholder="Melbourne, VIC" />
          <Field icon={Instagram} label="Instagram" value={instagram} onChange={setInstagram} placeholder="@yourhandle" />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} maxLength={120} className="w-full resize-none rounded-lg border border-border bg-secondary p-2.5 text-sm outline-none focus:border-primary" placeholder="Tell the community about your builds..." />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ icon: Icon, label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm outline-none" />
      </div>
    </div>
  );
}