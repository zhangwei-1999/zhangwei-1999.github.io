export function Icon({
  name,
  size = 18,
}: {
  name:
    | "arrow"
    | "mail"
    | "github"
    | "scholar"
    | "menu"
    | "close"
    | "location"
    | "spark"
    | "lock";
  size?: number;
}) {
  const paths = {
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    github: (
      <>
        <path d="M9 19c-4 1-4-2-6-2m12 4v-3.4c0-1 .1-1.5-.5-2 3-.3 6-1.5 6-6.5a5 5 0 0 0-1.4-3.4c.1-.4.6-1.8-.2-3.6 0 0-1.2-.4-3.7 1.4a12 12 0 0 0-6.4 0C6.3 1.7 5 2.1 5 2.1c-.8 1.8-.3 3.2-.2 3.6A5 5 0 0 0 3.5 9c0 5 3 6.2 6 6.5-.4.4-.6 1-.5 2V21" />
      </>
    ),
    scholar: (
      <>
        <path d="m2 9 10-5 10 5-10 5-10-5Zm4 2v6c4 3 8 3 12 0v-6M22 9v7" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    location: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
