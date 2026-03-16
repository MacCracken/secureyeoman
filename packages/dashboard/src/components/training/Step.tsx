export function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
        {n}
      </span>
      <div>
        <span className="font-medium text-foreground">{title} — </span>
        <span className="text-muted-foreground">{children}</span>
      </div>
    </div>
  );
}
