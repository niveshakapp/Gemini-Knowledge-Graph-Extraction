interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-8 pb-6 border-b border-border/50">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0 ml-4">
          {action}
        </div>
      )}
    </div>
  );
}
