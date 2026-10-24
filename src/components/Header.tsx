// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Header — Top Bar
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//  WHAT THIS COMPONENT DOES:
//    Renders the app title "Fix Your Neck" and two toggle buttons:
//    - Admin Panel: opens/closes the settings sidebar
//    - Debug: shows/hides the real-time AI debug overlay
//
//  WHERE THE DATA COMES FROM:
//    Props passed from App.tsx (the parent). App holds the state for
//    showSettings and showDebug, and provides callbacks to flip them.
//
//  WHY THIS IS A SEPARATE COMPONENT:
//    The header has NO logic — it's pure UI. Extracting it makes App.tsx
//    shorter and makes the header reusable/testable in isolation.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── PROPS ──────────────────────────────────────────────────────────────────────
// These tell the header what to display and what happens when buttons are clicked.
interface HeaderProps {
  showSettings: boolean      // Is the admin panel currently open?
  showDebug: boolean         // Is the debug overlay currently visible?
  onToggleSettings: () => void   // Callback: user clicked the Admin Panel button
  onToggleDebug: () => void      // Callback: user clicked the Debug button
}

// ── COMPONENT ──────────────────────────────────────────────────────────────────
export default function Header({
  showSettings,
  showDebug,
  onToggleSettings,
  onToggleDebug,
}: HeaderProps) {
  return (
    <header>
      {/* ── Title ── simple heading with brand color */}
      <h1>Fix Your Neck</h1>
      <p className="subtitle">AI-powered neck exercise tracker</p>

      {/* ── Button row ── positioned top-right in the header via CSS */}
      <div style={{ display: 'flex', gap: '10px' }}>
        {/* Admin Panel toggle: label changes based on current state */}
        <button className="btn-debug" onClick={onToggleSettings}>
          {showSettings ? '⚙️ Admin Panel OPEN' : '⚙️ Admin Panel'}
        </button>

        {/* Debug toggle: simple ON/OFF label */}
        <button className="btn-debug" onClick={onToggleDebug}>
          {showDebug ? 'Debug ON' : 'Debug'}
        </button>
      </div>
    </header>
  )
}
