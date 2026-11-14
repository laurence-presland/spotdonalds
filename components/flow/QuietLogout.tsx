export function QuietLogout() {
  return (
    <form className="quiet-logout" action="/auth/logout" method="post">
      <button type="submit">Log out</button>
    </form>
  );
}
