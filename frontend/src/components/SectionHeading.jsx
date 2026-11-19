export function SectionHeading({ eyebrow, title, action, onAction }) {
  return <div className="section-heading"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>{action && <button className="text-action" onClick={onAction}>{action}<span>↗</span></button>}</div>
}
