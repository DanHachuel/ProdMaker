import React from "react";

export default function PlaceholderPage({ emoji, title, subtitle, items = [] }) {
  return (
    <section>
      <h1>{emoji} {title}</h1>
      <p className="subtitle">{subtitle}</p>
      <div className="form-card">
        {items.length > 0 && (
          <>
            <h3 style={{ fontSize: "15px", marginBottom: "6px" }}>O que vem neste módulo</h3>
            <ul className="placeholder-list">
              {items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </>
        )}
        <p className="placeholder-note">
          🚧 Em desenvolvimento — chegue aqui nas próximas partes do roadmap (veja o CHANGELOG).
        </p>
      </div>
    </section>
  );
}
