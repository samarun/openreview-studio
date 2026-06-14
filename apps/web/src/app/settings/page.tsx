"use client";

import { AuthGate } from "../../components/auth-gate";
import { SettingsPanel } from "../../components/settings-panel";

export default function SettingsPage() {
  return <AuthGate>{(token, user) => <SettingsPanel token={token} user={user} />}</AuthGate>;
}
