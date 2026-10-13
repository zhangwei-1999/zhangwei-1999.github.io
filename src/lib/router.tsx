import {
  createContext,
  useContext,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

const RouterContext = createContext({
  path: "/",
  navigate: (_path: string) => {},
});
export function normalizePath(path: string) {
  return `/${path.split("/").filter(Boolean).join("/")}`;
}
export function routeHref(path: string) {
  const base = import.meta.env?.BASE_URL ?? process.env.PAGES_BASE_PATH ?? "/";
  return `${base.replace(/\/$/, "")}${normalizePath(path)}${normalizePath(path) === "/" ? "" : "/"}`;
}
export function browserPath() {
  const base = import.meta.env?.BASE_URL ?? "/";
  let path = window.location.pathname;
  try {
    path = decodeURI(path);
  } catch {
    /* An invalid escaped path still gets the 404 view. */
  }
  const prefix = base.replace(/\/$/, "");
  if (path === prefix || path.startsWith(`${prefix}/`))
    path = path.slice(prefix.length);
  return normalizePath(path.replace(/\/index\.html$/, "/"));
}
export function RouterProvider({
  initialPath,
  children,
}: {
  initialPath: string;
  children: ReactNode;
}) {
  const [path, setPath] = useState(normalizePath(initialPath));
  useEffect(() => {
    const pop = () => setPath(browserPath());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function navigate(next: string) {
    if (normalizePath(next) === path) return;
    window.history.pushState({}, "", routeHref(next));
    setPath(normalizePath(next));
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>("main")
        ?.focus({ preventScroll: true }),
    );
  }
  return (
    <RouterContext.Provider value={{ path, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}
export function useRouter() {
  return useContext(RouterContext);
}
export function Link({
  to,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { navigate } = useRouter();
  return (
    <a
      {...props}
      href={routeHref(to)}
      onClick={(event) => {
        onClick?.(event);
        if (
          !event.defaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          !props.target
        ) {
          event.preventDefault();
          navigate(to);
        }
      }}
    />
  );
}
