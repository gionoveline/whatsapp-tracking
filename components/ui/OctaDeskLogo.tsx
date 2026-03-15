/**
 * Logo OctaDesk — apenas o ícone (polvo), sem o texto "OctaDesk".
 * Fonte: https://cdn.prod.website-files.com/60e35c6041d222f27a068d89/6978b31d67d4da7da01a3c3a_logotipo.svg
 * Exibido com crop à esquerda para mostrar só o polvo.
 */
export function OctaDeskLogo({ className }: { className?: string }) {
  return (
    <span className={`inline-block overflow-hidden ${className ?? ""}`.trim()} style={{ width: 20, height: 19 }}>
      <img
        src="https://cdn.prod.website-files.com/60e35c6041d222f27a068d89/6978b31d67d4da7da01a3c3a_logotipo.svg"
        alt="OctaDesk"
        className="h-full w-auto max-w-none object-contain object-left"
        width={88}
        height={19}
        aria-hidden
      />
    </span>
  );
}
