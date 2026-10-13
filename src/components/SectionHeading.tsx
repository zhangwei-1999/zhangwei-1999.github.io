import { Link } from "../lib/router";
import { Icon } from "./Icon";

export function SectionHeading({
  title,
  index,
  link,
  label,
}: {
  title: string;
  index?: string;
  link?: string;
  label?: string;
}) {
  return (
    <div className="section-heading">
      <h2>
        {index && <span className="section-index">{index}</span>}
        {title}
      </h2>
      {link && (
        <Link to={link} className="text-link">
          {label}
          <Icon name="arrow" size={16} />
        </Link>
      )}
    </div>
  );
}
