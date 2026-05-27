"use client";

/**
 * Página /admin/farmers — Administração.
 *
 * Layout enxuto: hero + um único componente FarmerManager que cuida
 * de tudo (squad, ocultar, remover, data de início, adicionar novo).
 *
 * A largura segue o padrão do dash (max-w-6xl) e a tabela usa o mesmo
 * estilo do card "Detalhe por farmer".
 */

import { useEffect, useState } from "react";
import FarmerManager from "@/components/FarmerManager";

export default function AdminFarmersPage() {
  const [accessKey, setAccessKey] = useState("");

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key") || "";
    setAccessKey(k);
  }, []);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-psa-ink text-white shadow-card">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full bg-psa-orange opacity-20 blur-[2px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 h-full w-1.5 bg-psa-orange"
        />
        <div className="relative px-8 py-8">
          <div className="mb-5">
            <a
              href={`/${accessKey ? `?key=${encodeURIComponent(accessKey)}` : ""}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
              Voltar para o dashboard
            </a>
          </div>

          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-psa-orange/15 border border-psa-orange/30">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-psa-orange" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white">
              PSA · Administração
            </span>
          </div>
          <h1 className="font-display text-[36px] leading-[1.05] font-extrabold tracking-tight text-white">
            Administração
            <br />
            <span className="text-psa-orange">de farmers.</span>
          </h1>
          <p className="mt-4 text-sm text-white/85 max-w-md">
            Gerencie squad, visibilidade, data de início e adicione/remova
            farmers do dashboard — tudo em uma só tabela.
          </p>
        </div>
      </section>

      <FarmerManager accessKey={accessKey} />
    </main>
  );
}
