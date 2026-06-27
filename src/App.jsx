import { BrowserRouter } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import { About, Contact, Experience, Feedbacks, Hero, Navbar, Tech, Works, StarsCanvas} from './components';

// The full 3D arcade world (WASD, physics, throwables, mini-game cabinets) is
// heavy (rapier WASM + a whole r3f scene), so it is code-split and only loaded
// when the visitor chooses to enter it. Keeps the portfolio's first paint fast.
const ArcadeExperience = lazy(() => import('./arcade'));

function ArcadeLoading() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: '#05010f',
        color: '#36d6ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        fontWeight: 800,
        letterSpacing: '0.15em',
      }}
    >
      ENTERING THE ARCADE…
    </div>
  );
}

function App() {
  const [showArcade, setShowArcade] = useState(false);

  return (
    <>
      <BrowserRouter>
        <div className="relative z-0 bg-primary">
          <div className="bg-hero-pattern bg-cover bg-no-repeat bg-center">
            <Navbar />
            <Hero />
          </div>
          <About />
          <Experience />
          <Tech />
          <Works />
          <Feedbacks />
          <div className="relative z-0">
            <Contact />
            <StarsCanvas />
          </div>
        </div>
      </BrowserRouter>

      {/* Floating launcher for the explorable 3D arcade world. */}
      {!showArcade && (
        <button
          type="button"
          onClick={() => setShowArcade(true)}
          style={{
            position: 'fixed',
            right: 20,
            bottom: 20,
            zIndex: 50,
            padding: '12px 20px',
            borderRadius: 14,
            border: '1px solid #ff5cf4',
            background: 'linear-gradient(120deg, rgba(54,214,255,0.18), rgba(255,92,244,0.22))',
            color: '#eafcff',
            fontFamily: 'monospace',
            fontWeight: 800,
            letterSpacing: '0.08em',
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 0 18px rgba(255,92,244,0.45), 0 0 40px rgba(54,214,255,0.25)',
          }}
        >
          ▶ ENTER THE ARCADE
        </button>
      )}

      {showArcade && (
        <Suspense fallback={<ArcadeLoading />}>
          <ArcadeExperience onExit={() => setShowArcade(false)} />
        </Suspense>
      )}
    </>
  )
}

export default App
