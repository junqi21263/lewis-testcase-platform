/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        /** Friendly workspace：同一套 light/dark token，侧栏/顶栏/面板/空状态共用 */
        workspace: {
          page: 'hsl(var(--workspace-page-bg) / <alpha-value>)',
          'sidebar-bg': 'hsl(var(--workspace-sidebar-bg) / <alpha-value>)',
          'sidebar-border': 'hsl(var(--workspace-sidebar-border) / <alpha-value>)',
          'sidebar-text': 'hsl(var(--workspace-sidebar-text) / <alpha-value>)',
          'sidebar-text-muted': 'hsl(var(--workspace-sidebar-text-muted) / <alpha-value>)',
          'sidebar-active-bg': 'hsl(var(--workspace-sidebar-active-bg) / <alpha-value>)',
          'sidebar-active-text': 'hsl(var(--workspace-sidebar-active-text) / <alpha-value>)',
          'sidebar-active-border': 'hsl(var(--workspace-sidebar-active-border) / <alpha-value>)',
          topbar: 'hsl(var(--workspace-topbar-bg) / <alpha-value>)',
          'topbar-border': 'hsl(var(--workspace-topbar-border) / <alpha-value>)',
          control: 'hsl(var(--workspace-topbar-control-bg) / <alpha-value>)',
          panel: 'hsl(var(--workspace-panel-bg) / <alpha-value>)',
          'panel-border': 'hsl(var(--workspace-panel-border) / <alpha-value>)',
          'panel-muted': 'hsl(var(--workspace-panel-muted-bg) / <alpha-value>)',
          'text-primary': 'hsl(var(--workspace-text-primary) / <alpha-value>)',
          'text-secondary': 'hsl(var(--workspace-text-secondary) / <alpha-value>)',
          'text-muted': 'hsl(var(--workspace-text-muted) / <alpha-value>)',
          icon: 'hsl(var(--workspace-icon) / <alpha-value>)',
          'action-tile': 'hsl(var(--workspace-action-tile-bg) / <alpha-value>)',
          'metric-card': 'hsl(var(--workspace-metric-card-bg) / <alpha-value>)',
          'list-panel': 'hsl(var(--workspace-list-panel-bg) / <alpha-value>)',
          'empty-state': 'hsl(var(--workspace-empty-state-bg) / <alpha-value>)',
          'toggle-track': 'hsl(var(--workspace-theme-toggle-track) / <alpha-value>)',
          'toggle-thumb': 'hsl(var(--workspace-theme-toggle-thumb))',
          'toggle-active-icon': 'hsl(var(--workspace-theme-toggle-active-icon))',
          'toggle-inactive-icon': 'hsl(var(--workspace-theme-toggle-inactive-icon))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'var(--radius)',
        '2xl': 'var(--radius)',
        '3xl': 'var(--radius)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
