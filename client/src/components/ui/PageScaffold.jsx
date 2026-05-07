function PageScaffold({
  header,
  actions,
  children,
  footer,
  className = "",
  bodyClassName = "",
  headerClassName = "",
  footerClassName = "",
  compact = false,
}) {
  return (
    <div
      className={`page-scaffold flex min-h-0 flex-1 flex-col overflow-hidden ${compact ? "page-scaffold-compact" : ""} ${className}`}
    >
      {(header || actions) && (
        <div className={`page-scaffold-header ${headerClassName}`}>
          <div className="page-scaffold-header-row">
            {header ? <div className="min-w-0 flex-1">{header}</div> : <div className="flex-1" />}
            {actions ? <div className="page-scaffold-actions">{actions}</div> : null}
          </div>
        </div>
      )}

      <div className={`page-scaffold-body ${bodyClassName}`}>{children}</div>

      {footer ? <div className={`page-scaffold-footer ${footerClassName}`}>{footer}</div> : null}
    </div>
  );
}

export default PageScaffold;
