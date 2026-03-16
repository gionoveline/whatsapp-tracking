export function OctaDeskLogo({ className }: { className?: string }) {
  return (
    <span className={`inline-block overflow-hidden ${className ?? ""}`.trim()} style={{ width: 20, height: 19 }}>
      {/* Versão padrão (clara) */}
      <img
        src="https://cdn.prod.website-files.com/60e35c6041d222f27a068d89/6978b31d67d4da7da01a3c3a_logotipo.svg"
        alt="OctaDesk"
        className="block h-full w-auto max-w-none object-contain object-left dark:hidden"
        width={88}
        height={19}
        aria-hidden
      />
      {/* Versão branca para dark mode */}
      <img
        src="https://cdn.prod.website-files.com/60e35c6041d222f27a068d89/691db469e7d2951439a3561e_logotipo-octadesk-branco.svg"
        alt="OctaDesk"
        className="hidden h-full w-auto max-w-none object-contain object-left dark:block"
        width={88}
        height={19}
        aria-hidden
      />
    </span>
  );
}
