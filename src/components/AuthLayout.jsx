import React from "react";

export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img src="/teamora-logo.png" alt="Teamora" className="h-14 w-auto mx-auto mb-6" draggable={false} />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-card border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
