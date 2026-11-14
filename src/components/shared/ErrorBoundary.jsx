import { Component } from "react";
import { currentLang } from "@/api/errors";

// Greška u jednoj stranici ne sme da obori celu aplikaciju u belu stranicu (QA 14.11.2026):
// meni ostaje, korisnik vidi poruku i može da ode na drugu stranicu ili ponovo učita ovu.
const TEXT = {
  en: { title: "This page hit an error", body: "Your data is safe. Reload the page or open another one from the menu.", reload: "Reload page" },
  rs: { title: "Na ovoj stranici je došlo do greške", body: "Podaci nisu izgubljeni. Učitajte stranicu ponovo ili izaberite drugu iz menija.", reload: "Učitaj ponovo" },
};

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[stranica] Neuhvaćena greška:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const T = TEXT[currentLang()] || TEXT.en;
    return (
      <div role="alert" className="max-w-lg mx-auto mt-16 p-6 border rounded-xl bg-card text-center space-y-3">
        <h2 className="text-lg font-semibold">{T.title}</h2>
        <p className="text-sm text-muted-foreground">{T.body}</p>
        <p className="text-xs font-mono text-muted-foreground break-words">{String(this.state.error?.message || "")}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted"
        >
          {T.reload}
        </button>
      </div>
    );
  }
}
