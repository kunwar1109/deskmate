// "(auth)" is a route group: it shares this centered layout between /login and /signup
// without adding "/auth" to the URL.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
