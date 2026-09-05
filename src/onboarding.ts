export type BusinessProfile = Record<string, any> | null | undefined

export function hasConnectableBusinessProfile(profile: BusinessProfile) {
  return Boolean(profile?.legalBusinessName && profile?.displayName && profile?.industry && profile?.country && profile?.businessEmail && profile?.businessPhone && (profile?.businessDescription || profile?.workspaceSetup?.businessDescription))
}

export function canLaunchEmbeddedSignup(profile: BusinessProfile, connected: boolean) {
  return hasConnectableBusinessProfile(profile) && !connected
}
