// Clerk appearance + copy for every Clerk component (passed to ClerkProvider in the root layout).
// The Clerk application is shared with another product, so the app name never comes from Clerk:
// every en-US string that interpolates {{applicationName}} on the sign-in/up path is overridden here.

// Clerk reads these CSS variables, so the widgets follow the light/dark theme with no JS.
export const clerkAppearance = {
  variables: {
    colorPrimary: 'var(--primary)',
    colorPrimaryForeground: 'var(--primary-foreground)',
    colorBackground: 'var(--surface)',
    colorForeground: 'var(--foreground)',
    colorMutedForeground: 'var(--muted-foreground)',
    colorMuted: 'var(--surface-2)',
    colorInput: 'var(--surface)',
    colorInputForeground: 'var(--foreground)',
    colorBorder: 'var(--border-strong)',
    colorDanger: 'var(--bad)',
    colorSuccess: 'var(--good)',
    colorWarning: 'var(--warn)',
    colorNeutral: 'var(--foreground)',
    colorRing: 'var(--ring)',
    colorShadow: 'transparent',
    fontFamily: 'var(--font-plex), system-ui, sans-serif',
    borderRadius: '0.5rem',
  },
  options: {
    // Hides the "Development mode" strip on the dev instance; production has none anyway.
    unsafe_disableDevelopmentModeWarnings: true,
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full max-w-[400px] shadow-none! border border-border rounded-lg',
    card: 'shadow-none!',
    headerTitle: 'text-2xl font-semibold tracking-tight',
    formButtonPrimary: 'min-h-12 rounded-[6px] text-[15px] font-semibold normal-case shadow-none!',
    socialButtonsBlockButton: 'min-h-12 border! border-border-strong! bg-surface!',
    formFieldInput: 'min-h-12 border! border-border-strong!',
    footerActionLink: 'text-primary',
  },
}

const toPassage = 'to continue to Passage'

export const clerkLocalization = {
  signIn: {
    start: {
      title: 'Sign in to Passage',
      titleCombined: 'Sign in to Passage',
      subtitle: 'Export compliance workspace',
      subtitleCombined: 'Export compliance workspace',
      alternativePhoneCodeProvider: { title: 'Sign in to Passage with {{provider}}' },
    },
    emailCode: { subtitle: toPassage },
    emailCodeMfa: { subtitle: toPassage },
    emailLink: { subtitle: toPassage },
    emailLinkMfa: { subtitle: toPassage },
    phoneCode: { subtitle: toPassage },
    alternativePhoneCodeProvider: { subtitle: toPassage },
    ssoBypass: { code: { subtitle: toPassage } },
  },
  signUp: {
    start: {
      title: 'Create your Passage account',
      titleCombined: 'Create your Passage account',
      subtitle: 'Export compliance workspace',
      subtitleCombined: 'Export compliance workspace',
      alternativePhoneCodeProvider: { title: 'Sign up to Passage with {{provider}}' },
    },
    emailLink: { subtitle: toPassage },
  },
  organizationList: { subtitle: toPassage },
}
