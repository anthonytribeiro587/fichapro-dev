export function StatusPill({ label, tone }: { label: string; tone?: string }) {
  return <span className={`status-pill ${tone || label.toLowerCase()}`}>{label}</span>;
}
